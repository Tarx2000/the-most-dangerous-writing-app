/// AI queue — the singleton sequential processing pipeline (SPEC §9,
/// `.agents/instructions/ai-integration.md`).
///
/// Rules ported 1:1:
///  - sequential, concurrency 1, 500 ms rate limit between jobs
///  - batch order journal → circle → checkin, newest first within category
///  - retries: max 2 on retryable kinds, failed job moves to the END of the
///    queue; 3rd failure → permanent fail + notification
///  - permanent fail (no retry): auth | config | parse | missing credentials
///  - offline detection: network|timeout|auth|rateLimit|server pause the
///    queue; health check every 10 s (60 s when persistently offline);
///    auto-resume when a ping succeeds
///  - job timeout 180 s, stall detection 60 s (checked every 10 s)
///  - persistence: only queued/processing jobs survive restarts;
///    orphaned `processing` jobs reset to `queued` on boot
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/logger.dart';
import '../../core/utils.dart';
import '../models/saved_note.dart';
import '../services/ai_config.dart';
import '../services/ai_error.dart';
import '../services/ai_logger.dart';
import '../services/ai_service.dart';

/// Persisted job model (SPEC §9).
class AiJob {
  const AiJob({
    required this.id,
    required this.noteId,
    required this.category,
    required this.status,
    required this.createdAt,
    this.startedAt,
    this.completedAt,
    this.error,
    this.retryCount = 0,
  });

  final String id;
  final String noteId;
  final String category;
  final String status; // queued | processing | done | failed
  final int createdAt;
  final int? startedAt;
  final int? completedAt;
  final String? error;
  final int retryCount;

  AiJob copyWith({
    String? status,
    int? startedAt,
    int? completedAt,
    String? Function()? error,
    int? retryCount,
  }) {
    return AiJob(
      id: id,
      noteId: noteId,
      category: category,
      status: status ?? this.status,
      createdAt: createdAt,
      startedAt: startedAt ?? this.startedAt,
      completedAt: completedAt ?? this.completedAt,
      error: error != null ? error() : this.error,
      retryCount: retryCount ?? this.retryCount,
    );
  }

  Map<String, Object?> toJson() => {
        'id': id,
        'noteId': noteId,
        'category': category,
        'status': status,
        'createdAt': createdAt,
        'startedAt': startedAt,
        'completedAt': completedAt,
        'error': error,
        'retryCount': retryCount,
      };

  static AiJob? fromJson(Map<String, dynamic> json) {
    try {
      return AiJob(
        id: json['id'] as String? ?? '',
        noteId: json['noteId'] as String? ?? '',
        category: json['category'] as String? ?? AiJobCategory.journal,
        status: json['status'] as String? ?? 'queued',
        createdAt: (json['createdAt'] as num?)?.toInt() ?? 0,
        startedAt: (json['startedAt'] as num?)?.toInt(),
        completedAt: (json['completedAt'] as num?)?.toInt(),
        error: json['error'] as String?,
        retryCount: (json['retryCount'] as num?)?.toInt() ?? 0,
      );
    } catch (_) {
      return null;
    }
  }
}

/// Full queue state surfaced to the UI.
class AiQueueState {
  const AiQueueState({
    this.isProcessing = false,
    this.currentJob,
    this.pendingCount = 0,
    this.serverOnline = true,
    this.lastError,
  });

  final bool isProcessing;
  final AiJob? currentJob;
  final int pendingCount;
  final bool serverOnline;
  final String? lastError;
}

/// Failure notification surfaced in the UI (last 5 kept).
class AiFailureNotification {
  const AiFailureNotification({
    required this.id,
    required this.noteId,
    required this.message,
    required this.timestamp,
    this.isTimeout = false,
    this.isPermanent = false,
    this.errorKind,
  });

  final String id;
  final String noteId;
  final String message;
  final int timestamp;
  final bool isTimeout;
  final bool isPermanent;
  final String? errorKind;
}

/// Dependency accessors the queue needs (injected to keep it testable and
/// free of Riverpod).
class AiQueueDeps {
  const AiQueueDeps({
    required this.loadNotes,
    required this.getNote,
    required this.updateNote,
    required this.getPersonName,
  });

  final Future<List<SavedNote>> Function() loadNotes;
  final Future<SavedNote?> Function(String id) getNote;
  final Future<void> Function(String id, Map<String, Object?> updates) updateNote;

  /// Resolves the relationship context for circle notes (name + status).
  final Future<RelationshipContext?> Function(String personId) getPersonName;
}

class AiQueueManager {
  AiQueueManager({
    required this.service,
    required this.deps,
    required this.logger,
    this.healthCheckIntervalMs = AiTiming.healthCheckIntervalMs,
  });

  final AiService service;
  final AiQueueDeps deps;
  final AiLogger logger;

  /// Health-check cadence (tests inject a short interval).
  final int healthCheckIntervalMs;

  static const _storageKey = 'AI_JOB_QUEUE';

  final List<AiJob> _jobs = [];
  final List<AiFailureNotification> _notifications = [];
  final ValueNotifier<AiQueueState> state = ValueNotifier(const AiQueueState());

  /// Emitted per failed job: `{noteId, error, permanent}`.
  final StreamController<Map<String, Object>> failedJobEvents = StreamController.broadcast();

  AiConfig? _config;
  AiCancelToken? _activeCancelToken;
  Timer? _rateLimitTimer;
  Timer? _healthCheckTimer;
  Timer? _stallCheckTimer;
  Timer? _jobTimeoutTimer;
  bool _paused = false;
  bool _isRunning = false;
  int _consecutivePingFailures = 0;

  // -- Lifecycle ---------------------------------------------------------------

  /// Boot: load persisted jobs, recover orphans, migrate legacy, start health checks.
  Future<void> initialize(AiConfig config) async {
    _config = config;
    await _loadPersisted();
    _recoverOrphans();
    await _migrateLegacyQueue();
    _startHealthChecks();
    logger.add(AiLogEntry(action: 'init', model: config.model, phase: 'both'));
    _logStartupDiagnostics();
    _scheduleNext();
  }

  void _logStartupDiagnostics() {
    final config = _config;
    if (config == null) return;
    final key = config.apiKey;
    final masked = key.isEmpty
        ? 'NOT SET'
        : key.length <= 12
            ? '${key.substring(0, key.length ~/ 2)}...'
            : '${key.substring(0, 8)}...${key.substring(key.length - 4)}';
    logAiQueue.debug('startup diagnostics',
        'key=$masked url=${config.baseUrl} model=${config.model} grammar=${config.grammarModel} '
        'customPrompts=${config.prompts.isNotEmpty} pending=${_jobs.where((j) => j.status != 'done' && j.status != 'failed').length}');
  }

  Future<void> shutdown() async {
    _rateLimitTimer?.cancel();
    _healthCheckTimer?.cancel();
    _stallCheckTimer?.cancel();
    _jobTimeoutTimer?.cancel();
    _activeCancelToken?.cancel();
  }

  // -- Public API -----------------------------------------------------------------

  /// Single note enqueue (dedupes: same noteId already queued/processing).
  void enqueueNote(String noteId, String category) {
    final exists = _jobs.any((j) => j.noteId == noteId && (j.status == 'queued' || j.status == 'processing'));
    if (exists) return;
    _addJob(AiJob(
      id: generateId(),
      noteId: noteId,
      category: category,
      status: 'queued',
      createdAt: DateTime.now().millisecondsSinceEpoch,
    ));
  }

  /// Batch enqueue (journal → circle → checkin, newest first; skips tweets
  /// and notes that already have AI metadata unless [forceOverwrite]).
  Future<void> enqueueBatch({bool forceOverwrite = false}) async {
    final notes = await deps.loadNotes();
    final ordered = [...notes]
      ..sort((a, b) {
        final catCmp = AiJobCategory.orderOf(_categoryFor(a))
            .compareTo(AiJobCategory.orderOf(_categoryFor(b)));
        if (catCmp != 0) return catCmp;
        return b.timestamp.compareTo(a.timestamp);
      });

    for (final note in ordered) {
      if (note.isTweet) continue;
      if (!forceOverwrite && note.aiTitle != null && note.aiSummary != null && note.aiModelUsed != null) {
        continue;
      }
      final category = _categoryFor(note);
      enqueueNote(note.id, category);
    }
    _scheduleNext();
  }

  /// Re-enqueues a failed note (clears its notifications first).
  Future<void> retryNote(String noteId) async {
    _notifications.removeWhere((n) => n.noteId == noteId);
    _notify();
    _jobs.removeWhere((j) => j.noteId == noteId && j.status == 'failed');
    final note = await deps.getNote(noteId);
    final category = note == null ? AiJobCategory.journal : _categoryFor(note);
    enqueueNote(noteId, category);
  }

  void cancelJob(String jobId) {
    final job = _jobs.where((j) => j.id == jobId && j.status == 'queued').firstOrNull;
    if (job == null) return;
    _removeJob(jobId);
  }

  void cancelBatch() {
    // Removes queued jobs; the current job finishes (SPEC).
    _jobs.removeWhere((j) => j.status == 'queued');
    _notify();
    _persist();
  }

  bool isNoteActive(String noteId) =>
      _jobs.any((j) => j.noteId == noteId && j.status == 'processing');

  bool isNoteQueued(String noteId) =>
      _jobs.any((j) => j.noteId == noteId && j.status == 'queued');

  int get activeCount =>
      _jobs.where((j) => j.status == 'queued' || j.status == 'processing').length;

  List<AiJob> get jobs => List.unmodifiable(_jobs);

  List<AiFailureNotification> get notifications => List.unmodifiable(_notifications);

  void dismissNotification(String id) {
    _notifications.removeWhere((n) => n.id == id);
    _notify();
  }

  void clearAllNotifications() {
    _notifications.clear();
    _notify();
  }

  void pause() {
    _paused = true;
    _activeCancelToken?.cancel();
  }

  void resume() {
    _paused = false;
    _scheduleNext();
  }

  /// Replaces the runtime config (config changes keep the queue alive but
  /// reset the connection state — SPEC §9).
  void updateConfig(AiConfig config) {
    _config = config;
    resetConnectionState();
  }

  /// Resets connection state when the config changes (SPEC: config changes
  /// reset `serverOnline`).
  void resetConnectionState() {
    state.value = AiQueueState(
      isProcessing: state.value.isProcessing,
      currentJob: state.value.currentJob,
      pendingCount: state.value.pendingCount,
      serverOnline: true,
    );
  }

  // -- Processing loop ------------------------------------------------------------

  void _scheduleNext() {
    if (_paused || _isRunning) return;
    if (!(state.value.serverOnline)) return;
    AiJob? next;
    for (final job in _jobs) {
      if (job.status == 'queued') {
        next = job;
        break;
      }
    }
    if (next == null) {
      _notify();
      return;
    }
    // Capture into a final so the closure sees a promoted non-null type.
    final jobToProcess = next;
    _isRunning = true;
    _rateLimitTimer?.cancel();
    _rateLimitTimer = Timer(const Duration(milliseconds: AiTiming.rateLimitDelayMs), () {
      unawaited(_processNext(jobToProcess));
    });
  }

  Future<void> _processNext(AiJob job) async {
    try {
      await _processJob(job);
    } catch (e) {
      logAiQueue.error('queue loop error', e);
    } finally {
      _isRunning = false;
      _jobTimeoutTimer?.cancel();
      _stallCheckTimer?.cancel();
      _scheduleNext();
    }
  }

  Future<void> _processJob(AiJob job) async {
    final config = _config;
    final note = await deps.getNote(job.noteId);

    // Pre-flight gates (SPEC §9).
    if (note == null) {
      _markFailed(job, 'Note deleted', 'Note deleted');
      return;
    }
    if (note.isTweet) {
      _markDone(job, 'tweet');
      return;
    }
    if (note.wordCount < 45) {
      _markDone(job, 'too short');
      return;
    }
    if (config == null) {
      _markFailed(job, 'AI not configured', 'AI settings are incomplete.');
      return;
    }
    if (config.apiKey.isEmpty || config.baseUrl.isEmpty) {
      _markFailed(job, 'missing credentials', 'No API key set. Add your key in AI Settings.',
          permanent: true);
      return;
    }

    // Set processing state.
    final processing = job.copyWith(
      status: 'processing',
      startedAt: DateTime.now().millisecondsSinceEpoch,
    );
    _replaceJob(processing);
    _startJobWatchdogs(processing);
    logger.add(AiLogEntry(
      action: 'start',
      noteId: note.id,
      model: config.model,
      phase: 'both',
    ));
    _notify();

    final cancelToken = AiCancelToken();
    _activeCancelToken = cancelToken;
    final started = DateTime.now();

    try {
      final relationship = note.personId != null
          ? await deps.getPersonName(note.personId!)
          : null;
      if (cancelToken.isCancelled) {
        throw const AiError(AiErrorKind.cancelled, 'cancelled');
      }

      final result = await service.processNote(
        config: config,
        text: note.text,
        relationship: relationship,
        cancelToken: cancelToken,
      );

      if (cancelToken.isCancelled) {
        throw const AiError(AiErrorKind.cancelled, 'cancelled');
      }
      if (result.failed) {
        // Empty results are retryable server errors (SPEC §9).
        throw const AiError(AiErrorKind.server, 'AI processing returned empty results.');
      }

      await deps.updateNote(note.id, {
        'ai_title': result.title,
        'ai_summary': jsonEncode(result.summary),
        'ai_model_used': config.model,
      });

      _markDone(processing, 'success', started: started);
      _serverOnline(true);
    } on AiError catch (error) {
      _handleJobError(processing, error, started: started);
    } catch (e) {
      _handleJobError(processing, classifyError(e), started: started);
    } finally {
      _activeCancelToken = null;
    }
  }

  void _handleJobError(AiJob job, AiError error, {required DateTime started}) {
    final durationMs = DateTime.now().difference(started).inMilliseconds;

    // Internal cancellations (pause/stall/offline) reset the job to queued
    // without a failure notification (SPEC: cancel is not a failure).
    if (error.kind == AiErrorKind.cancelled) {
      _replaceJob(job.copyWith(status: 'queued'));
      _persist();
      _notify();
      return;
    }

    final permanent = !isRetryableKind(error.kind);
    final willRetry = !permanent && job.retryCount < AiTiming.maxRetries;

    // Server-offline kinds pause the queue (SPEC §9).
    switch (error.kind) {
      case AiErrorKind.network:
      case AiErrorKind.timeout:
      case AiErrorKind.auth:
      case AiErrorKind.rateLimit:
      case AiErrorKind.server:
        _serverOnline(false, error.uiMessage);
        break;
      default:
        break;
    }

    logger.add(AiLogEntry(
      action: willRetry ? 'retry' : 'fail',
      noteId: job.noteId,
      model: _config?.model ?? '',
      phase: 'both',
      durationMs: durationMs,
      error: error.message,
    ));

    if (willRetry) {
      // Move to the END of the queue with retryCount + 1 (SPEC).
      _removeJob(job.id);
      _jobs.add(job.copyWith(
        status: 'queued',
        error: () => error.message,
        retryCount: job.retryCount + 1,
      ));
      _notify();
      _persist();
    } else {
      _markFailed(job, error.message, error.uiMessage,
          permanent: permanent,
          errorKind: error.kind.name,
          durationMs: durationMs);
    }
  }

  void _markFailed(AiJob job, String technical, String userFacing,
      {bool permanent = true, String? errorKind, int? durationMs}) {
    _replaceJob(job.copyWith(
      status: 'failed',
      completedAt: DateTime.now().millisecondsSinceEpoch,
      error: () => technical,
    ));
    _notifications.add(AiFailureNotification(
      id: generateId(),
      noteId: job.noteId,
      message: userFacing,
      timestamp: DateTime.now().millisecondsSinceEpoch,
      isPermanent: permanent,
      errorKind: errorKind,
    ));
    if (_notifications.length > 5) _notifications.removeAt(0);
    logger.add(AiLogEntry(
      action: 'fail',
      noteId: job.noteId,
      model: _config?.model ?? '',
      phase: 'both',
      durationMs: durationMs,
      error: technical,
    ));
    _notify();
    _persist();
    failedJobEvents.add({'noteId': job.noteId, 'error': userFacing, 'permanent': permanent});
  }

  void _markDone(AiJob job, String reason, {DateTime? started}) {
    _replaceJob(job.copyWith(
      status: 'done',
      completedAt: DateTime.now().millisecondsSinceEpoch,
    ));
    logger.add(AiLogEntry(
      action: 'success',
      noteId: job.noteId,
      model: _config?.model ?? '',
      phase: 'both',
      durationMs: started != null ? DateTime.now().difference(started).inMilliseconds : null,
    ));
    _notify();
    _persist();
  }

  // -- Watchdogs ------------------------------------------------------------------

  void _startJobWatchdogs(AiJob job) {
    _jobTimeoutTimer?.cancel();
    _jobTimeoutTimer = Timer(const Duration(milliseconds: AiTiming.jobTimeoutMs), () {
      _activeCancelToken?.cancel();
      _markFailed(job, 'Job timed out', 'AI processing timed out.',
          permanent: true);
      logger.add(AiLogEntry(
        action: 'timeout',
        noteId: job.noteId,
        model: _config?.model ?? '',
        phase: 'both',
      ));
    });

    // Stall detection: 60 s without progress → abort, requeue with retries 0.
    var lastChunkAt = DateTime.now();
    _stallCheckTimer?.cancel();
    _stallCheckTimer = Timer.periodic(const Duration(seconds: 10), (timer) {
      if (DateTime.now().difference(lastChunkAt).inMilliseconds >= AiTiming.stallDetectionMs) {
        _activeCancelToken?.cancel();
        _removeJob(job.id);
        _jobs.add(job.copyWith(
          status: 'queued',
          retryCount: 0,
          error: () => 'stall detected',
        ));
        logger.add(AiLogEntry(
          action: 'stall_recovery',
          noteId: job.noteId,
          model: _config?.model ?? '',
          phase: 'both',
        ));
        _notify();
        _persist();
        timer.cancel();
      }
    });
  }

  // -- Health checks ----------------------------------------------------------------

  void _startHealthChecks() {
    _healthCheckTimer?.cancel();
    _healthCheckTimer = Timer.periodic(
      Duration(milliseconds: healthCheckIntervalMs),
      (_) => _runHealthCheck(),
    );
  }

  Future<void> _runHealthCheck() async {
    if (_paused) return;
    if (state.value.serverOnline) return;
    final config = _config;
    if (config == null) return;
    try {
      final ok = await service.pingServer(config);
      if (ok) {
        _consecutivePingFailures = 0;
        _serverOnline(true);
        _scheduleNext();
      } else {
        _consecutivePingFailures++;
      }
    } catch (e) {
      _consecutivePingFailures++;
    }
    // Persistently offline → widen the check interval (SPEC).
    if (_consecutivePingFailures >= AiTiming.persistentOfflineThreshold) {
      _healthCheckTimer?.cancel();
      _healthCheckTimer = Timer.periodic(
        const Duration(milliseconds: AiTiming.healthCheckPersistentlyOfflineMs),
        (_) => _runHealthCheck(),
      );
    }
  }

  void _serverOnline(bool online, [String? error]) {
    state.value = AiQueueState(
      isProcessing: state.value.isProcessing,
      currentJob: state.value.currentJob,
      pendingCount: state.value.pendingCount,
      serverOnline: online,
      lastError: online ? null : error,
    );
    if (!online) {
      _activeCancelToken?.cancel();
    }
  }

  // -- Persistence ------------------------------------------------------------------

  Future<void> _loadPersisted() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final raw = sp.getString(_storageKey);
      if (raw == null || raw.isEmpty) return;
      final decoded = jsonDecode(raw);
      if (decoded is! List) return;
      for (final item in decoded) {
        if (item is Map<String, dynamic>) {
          final job = AiJob.fromJson(item);
          if (job != null &&
              (job.status == 'queued' || job.status == 'processing')) {
            _jobs.add(job);
          }
        }
      }
    } catch (e) {
      logAiQueue.warn('queue load failed', e);
    }
  }

  Future<void> _persist() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final jobs = _jobs.where((j) => j.status == 'queued' || j.status == 'processing').toList();
      await sp.setString(_storageKey, jsonEncode([for (final j in jobs) j.toJson()]));
    } catch (_) {}
  }

  void _recoverOrphans() {
    var recovered = 0;
    for (var i = 0; i < _jobs.length; i++) {
      if (_jobs[i].status == 'processing') {
        _jobs[i] = _jobs[i].copyWith(status: 'queued', retryCount: 0);
        recovered++;
      }
    }
    if (recovered > 0) {
      logger.add(AiLogEntry(action: 'orphan_recovery', model: '', phase: 'both'));
      _persist();
    }
  }

  /// Legacy single-key queue migration (parity: AI_JOB_QUEUE legacy format).
  Future<void> _migrateLegacyQueue() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final legacy = sp.getString(_storageKey);
      if (legacy == null) return;
      final decoded = jsonDecode(legacy);
      if (decoded is List) {
        for (final item in decoded) {
          if (item is Map<String, dynamic>) {
            final noteId = item['noteId'] ?? item['note_id'];
            final category = item['category'] as String? ?? AiJobCategory.journal;
            if (noteId is String && noteId.isNotEmpty) {
              enqueueNote(noteId, category);
            }
          }
        }
      }
      await sp.remove(_storageKey);
    } catch (_) {}
  }

  // -- Helpers ---------------------------------------------------------------------

  String _categoryFor(SavedNote note) {
    if (note.isAlignmentReflection) return AiJobCategory.checkin;
    if (note.personId != null) return AiJobCategory.circle;
    return AiJobCategory.journal;
  }

  void _addJob(AiJob job) {
    if (_jobs.length >= AiTiming.maxQueueSize) {
      logAiQueue.warn('queue full, dropping job', job.noteId);
      return;
    }
    _jobs.add(job);
    logger.add(AiLogEntry(
      action: 'enqueue',
      noteId: job.noteId,
      model: _config?.model ?? '',
      phase: 'both',
    ));
    _notify();
    _persist();
    _scheduleNext();
  }

  void _replaceJob(AiJob job) {
    final index = _jobs.indexWhere((j) => j.id == job.id);
    if (index >= 0) _jobs[index] = job;
    _notify();
    _persist();
  }

  void _removeJob(String id) {
    _jobs.removeWhere((j) => j.id == id);
  }

  void _notify() {
    state.value = AiQueueState(
      isProcessing: _jobs.any((j) => j.status == 'processing'),
      currentJob: _jobs.where((j) => j.status == 'processing').firstOrNull,
      pendingCount: _jobs.where((j) => j.status == 'queued').length,
      serverOnline: state.value.serverOnline,
      lastError: state.value.lastError,
    );
  }
}
