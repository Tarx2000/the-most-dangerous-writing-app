/// Compression queue — the single authority for video compression jobs
/// (SPEC §11, mirror of `compressionQueue.ts`).
/// Sequential · 500 ms rate limit · 2 retries · 5-min hard timeout ·
/// progress 0→1 · active jobs NOT cancellable · orphan recovery ·
/// persistence (queued/processing/failed only).
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/logger.dart';
import '../../core/utils.dart';
import '../services/vlog_compressor.dart';

class CompressionJob {
  const CompressionJob({
    required this.id,
    required this.vlogId,
    required this.filePath,
    required this.presetId,
    required this.status,
    required this.createdAt,
    this.progress = 0,
    this.startedAt,
    this.completedAt,
    this.error,
    this.retryCount = 0,
  });

  final String id;
  final String vlogId;
  final String filePath;
  final String presetId;
  final String status; // queued | processing | done | failed | cancelled
  final double progress;
  final int createdAt;
  final int? startedAt;
  final int? completedAt;
  final String? error;
  final int retryCount;

  CompressionJob copyWith({
    String? status,
    double? progress,
    int? startedAt,
    int? completedAt,
    String? Function()? error,
    int? retryCount,
  }) {
    return CompressionJob(
      id: id,
      vlogId: vlogId,
      filePath: filePath,
      presetId: presetId,
      status: status ?? this.status,
      progress: progress ?? this.progress,
      createdAt: createdAt,
      startedAt: startedAt ?? this.startedAt,
      completedAt: completedAt ?? this.completedAt,
      error: error != null ? error() : this.error,
      retryCount: retryCount ?? this.retryCount,
    );
  }

  Map<String, Object?> toJson() => {
        'id': id,
        'vlogId': vlogId,
        'filePath': filePath,
        'presetId': presetId,
        'status': status,
        'progress': progress,
        'createdAt': createdAt,
        'startedAt': startedAt,
        'completedAt': completedAt,
        'error': error,
        'retryCount': retryCount,
      };

  static CompressionJob? fromJson(Map<String, dynamic> json) {
    try {
      return CompressionJob(
        id: json['id'] as String? ?? '',
        vlogId: json['vlogId'] as String? ?? '',
        filePath: json['filePath'] as String? ?? '',
        presetId: json['presetId'] as String? ?? 'balanced',
        status: json['status'] as String? ?? 'queued',
        progress: (json['progress'] as num?)?.toDouble() ?? 0,
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

class CompressionQueueState {
  const CompressionQueueState({
    this.isProcessing = false,
    this.currentJob,
    this.pendingCount = 0,
    this.jobs = const [],
  });

  final bool isProcessing;
  final CompressionJob? currentJob;
  final int pendingCount;
  final List<CompressionJob> jobs;
}

/// Callbacks the queue needs (injected for testability).
class CompressionDeps {
  const CompressionDeps({required this.updateVlog, required this.deleteVlogFile});

  final Future<void> Function(String vlogId, Map<String, Object?> updates) updateVlog;

  /// Deletes the ORIGINAL file after a successful compression swap.
  final Future<void> Function(String path) deleteVlogFile;
}

class CompressionQueueManager {
  CompressionQueueManager({
    required this.compressor,
    required this.deps,
  });

  static const int _rateLimitMs = 500;
  static const int _maxRetries = 2;
  static const int _timeoutMs = 5 * 60 * 1000;
  static const int _maxQueueSize = 50;

  final VlogCompressor compressor;
  final CompressionDeps deps;

  final List<CompressionJob> _jobs = [];
  final ValueNotifier<CompressionQueueState> state = ValueNotifier(const CompressionQueueState());

  bool _paused = false;
  bool _isRunning = false;
  Timer? _rateLimitTimer;
  Timer? _timeoutTimer;

  // -- Lifecycle -----------------------------------------------------------------

  Future<void> initialize() async {
    await _loadPersisted();
    _recoverOrphans();
    await _migrateLegacy();
    _scheduleNext();
  }

  Future<void> shutdown() async {
    _rateLimitTimer?.cancel();
    _timeoutTimer?.cancel();
  }

  // -- Public API ------------------------------------------------------------------

  bool isVlogActive(String vlogId) =>
      _jobs.any((j) => j.vlogId == vlogId && j.status == 'processing');

  bool isVlogQueued(String vlogId) =>
      _jobs.any((j) => j.vlogId == vlogId && j.status == 'queued');

  bool isVlogInQueue(String vlogId) => isVlogActive(vlogId) || isVlogQueued(vlogId);

  CompressionJob? getJobForVlog(String vlogId) {
    for (final job in _jobs) {
      if (job.vlogId == vlogId) return job;
    }
    return null;
  }

  int get activeCount => _jobs.where((j) => j.status == 'queued' || j.status == 'processing').length;

  List<CompressionJob> get jobs => List.unmodifiable(_jobs);

  /// Enqueues a compression job (dedupes: same vlog with a live job).
  void enqueueVlog(String vlogId, String filePath, String presetId) {
    if (isVlogInQueue(vlogId)) return;
    if (_jobs.length >= _maxQueueSize) {
      logCompressor.warn('queue full, dropping job', vlogId);
      return;
    }
    _jobs.add(CompressionJob(
      id: generateId(),
      vlogId: vlogId,
      filePath: filePath,
      presetId: presetId,
      status: 'queued',
      createdAt: DateTime.now().millisecondsSinceEpoch,
    ));
    _notify();
    _persist();
    _scheduleNext();
  }

  /// Only queued jobs can be cancelled (no native cancel API — SPEC §11).
  void cancelJob(String jobId) {
    final index = _jobs.indexWhere((j) => j.id == jobId && j.status == 'queued');
    if (index < 0) return;
    _jobs[index] = _jobs[index].copyWith(status: 'cancelled');
    _notify();
    _persist();
  }

  void retryJob(String jobId) {
    final index = _jobs.indexWhere((j) => j.id == jobId && (j.status == 'failed' || j.status == 'cancelled'));
    if (index < 0) return;
    _jobs[index] = _jobs[index].copyWith(status: 'queued', error: () => null);
    _notify();
    _persist();
    _scheduleNext();
  }

  void clearPending() {
    // Keeps only the active job (SPEC).
    _jobs.removeWhere((j) => j.status == 'queued');
    _notify();
    _persist();
  }

  void pause() {
    _paused = true;
  }

  void resume() {
    _paused = false;
    _scheduleNext();
  }

  // -- Processing loop ---------------------------------------------------------------

  void _scheduleNext() {
    if (_paused || _isRunning) return;
    CompressionJob? next;
    for (final job in _jobs) {
      if (job.status == 'queued') {
        next = job;
        break;
      }
    }
    if (next == null) {
      _prune();
      _notify();
      return;
    }
    final jobToProcess = next;
    _isRunning = true;
    _rateLimitTimer?.cancel();
    _rateLimitTimer = Timer(const Duration(milliseconds: _rateLimitMs), () {
      unawaited(_processJob(jobToProcess));
    });
  }

  Future<void> _processJob(CompressionJob job) async {
    try {
      final processing = job.copyWith(status: 'processing', startedAt: DateTime.now().millisecondsSinceEpoch);
      _replaceJob(processing);
      _startTimeoutWatchdog(processing);

      final result = await compressor.compressVideo(
        job.filePath,
        job.presetId,
        (progress) {
          _replaceJob(processing.copyWith(progress: progress.clamp(0.0, 1.0)));
        },
      );

      // Success → metadata update, delete the ORIGINAL, advance the queue.
      await deps.updateVlog(job.vlogId, {
        'file_path': result.outputUri,
        'file_size_bytes': result.outputSizeBytes,
        'original_file_size_bytes': result.originalSizeBytes,
        'compression_preset': job.presetId,
        'compression_pending': 0,
      });
      if (result.wasCompressed && result.outputUri != job.filePath) {
        await deps.deleteVlogFile(job.filePath);
      }

      _replaceJob(processing.copyWith(
        status: 'done',
        progress: 1,
        completedAt: DateTime.now().millisecondsSinceEpoch,
      ));
    } catch (e) {
      logCompressor.warn('compression failed', e);
      final willRetry = job.retryCount < _maxRetries;
      if (willRetry) {
        _replaceJob(job.copyWith(
          status: 'queued',
          error: () => '$e',
          retryCount: job.retryCount + 1,
        ));
      } else {
        _replaceJob(job.copyWith(
          status: 'failed',
          error: () => '$e',
          completedAt: DateTime.now().millisecondsSinceEpoch,
        ));
        // Clear compressionPending so no permanent "Compressing…" overlay.
        try {
          await deps.updateVlog(job.vlogId, {'compression_pending': 0});
        } catch (_) {}
      }
    } finally {
      _timeoutTimer?.cancel();
      _isRunning = false;
      _notify();
      _persist();
      _scheduleNext();
    }
  }

  void _startTimeoutWatchdog(CompressionJob job) {
    _timeoutTimer?.cancel();
    _timeoutTimer = Timer(const Duration(milliseconds: _timeoutMs), () async {
      // Hard timeout → failed (SPEC §11), clears compressionPending.
      _replaceJob(job.copyWith(
        status: 'failed',
        error: () => 'compression timed out',
        completedAt: DateTime.now().millisecondsSinceEpoch,
      ));
      try {
        await deps.updateVlog(job.vlogId, {'compression_pending': 0});
      } catch (_) {}
      _isRunning = false;
      _notify();
      _persist();
      _scheduleNext();
    });
  }

  // -- Persistence -------------------------------------------------------------------

  Future<void> _loadPersisted() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final raw = sp.getString('COMPRESSION_JOBS_QUEUE');
      if (raw == null || raw.isEmpty) return;
      final decoded = jsonDecode(raw);
      if (decoded is! List) return;
      for (final item in decoded) {
        if (item is Map<String, dynamic>) {
          final job = CompressionJob.fromJson(item);
          if (job != null &&
              (job.status == 'queued' || job.status == 'processing' || job.status == 'failed')) {
            _jobs.add(job);
          }
        }
      }
    } catch (e) {
      logCompressor.warn('queue load failed', e);
    }
  }

  Future<void> _persist() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final keep = _jobs.where((j) =>
          j.status == 'queued' || j.status == 'processing' || j.status == 'failed');
      await sp.setString('COMPRESSION_JOBS_QUEUE', jsonEncode([for (final j in keep) j.toJson()]));
    } catch (_) {}
  }

  void _recoverOrphans() {
    // Stale `processing` jobs reset to `queued` after a crash.
    for (var i = 0; i < _jobs.length; i++) {
      if (_jobs[i].status == 'processing') {
        _jobs[i] = _jobs[i].copyWith(status: 'queued', retryCount: 0);
      }
    }
  }

  /// Legacy `PENDING_COMPRESSIONS` migration (SPEC §11).
  Future<void> _migrateLegacy() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final legacy = sp.getString('PENDING_COMPRESSIONS');
      if (legacy == null) return;
      final decoded = jsonDecode(legacy);
      if (decoded is List) {
        for (final item in decoded) {
          if (item is Map<String, dynamic>) {
            final vlogId = item['vlogId'] ?? item['vlog_id'];
            final filePath = item['filePath'] ?? item['file_path'];
            if (vlogId is String && filePath is String && !isVlogInQueue(vlogId)) {
              enqueueVlog(vlogId, filePath, 'balanced');
            }
          }
        }
      }
      await sp.remove('PENDING_COMPRESSIONS');
    } catch (_) {}
  }

  /// Prunes done/cancelled jobs older than 5 minutes (SPEC §11).
  void _prune() {
    final cutoff = DateTime.now().millisecondsSinceEpoch - 5 * 60 * 1000;
    _jobs.removeWhere((j) =>
        (j.status == 'done' || j.status == 'cancelled') && (j.completedAt ?? 0) < cutoff);
  }

  void _replaceJob(CompressionJob job) {
    final index = _jobs.indexWhere((j) => j.id == job.id);
    if (index >= 0) _jobs[index] = job;
    _notify();
    _persist();
  }

  void _notify() {
    state.value = CompressionQueueState(
      isProcessing: _jobs.any((j) => j.status == 'processing'),
      currentJob: _jobs.where((j) => j.status == 'processing').firstOrNull,
      pendingCount: _jobs.where((j) => j.status == 'queued').length,
      jobs: List.unmodifiable(_jobs),
    );
  }
}
