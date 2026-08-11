/// AI processing log — FIFO ring buffer capped at [AiTiming.logMaxEntries]
/// (SPEC §9), persisted to SharedPreferences as JSON.
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../core/logger.dart';
import 'ai_config.dart';

class AiLogEntry {
  AiLogEntry({
    required this.action,
    this.noteId,
    required this.model,
    required this.phase,
    this.durationMs,
    this.error,
    int? timestamp,
  }) : timestamp = timestamp ?? DateTime.now().millisecondsSinceEpoch;

  final String action;
  final String? noteId;
  final String model;
  final String phase; // 'title' | 'summary' | 'both'
  final int? durationMs;
  final String? error;
  final int timestamp;

  Map<String, Object?> toJson() => {
        'action': action,
        'noteId': noteId,
        'model': model,
        'phase': phase,
        'durationMs': durationMs,
        'error': error,
        'timestamp': timestamp,
      };

  static AiLogEntry? fromJson(Map<String, dynamic> json) {
    try {
      return AiLogEntry(
        action: json['action'] as String? ?? '',
        noteId: json['noteId'] as String?,
        model: json['model'] as String? ?? '',
        phase: json['phase'] as String? ?? 'both',
        durationMs: (json['durationMs'] as num?)?.toInt(),
        error: json['error'] as String?,
        timestamp: (json['timestamp'] as num?)?.toInt(),
      );
    } catch (_) {
      return null;
    }
  }
}

class AiLogger {
  static const _storageKey = 'AI_PROCESSING_LOG';

  final List<AiLogEntry> _entries = [];
  Future<void> _pendingWrite = Future.value();

  List<AiLogEntry> get entries => List.unmodifiable(_entries);

  /// Appends an entry (FIFO capped) and persists through a serialized
  /// promise chain so concurrent writes never corrupt the log.
  void add(AiLogEntry entry) {
    _entries.add(entry);
    while (_entries.length > AiTiming.logMaxEntries) {
      _entries.removeAt(0);
    }
    _pendingWrite = _pendingWrite.then((_) => _persist()).catchError((Object e) {
      logAiQueue.warn('ai log persist failed', e);
    });
    _logConsole(entry);
  }

  void _logConsole(AiLogEntry entry) {
    final emoji = switch (entry.action) {
      'enqueue' => '📥',
      'start' => '▶️',
      'success' => '✅',
      'fail' => '❌',
      'cancel' => '🛑',
      'orphan_recovery' => '🔄',
      'retry' => '🔁',
      'timeout' => '⏱️',
      'stall_recovery' => '🚑',
      'init' => '🚀',
      'config' => '⚙️',
      _ => '•',
    };
    final level = entry.action == 'fail' ||
            entry.action == 'timeout' ||
            entry.action == 'stall_recovery'
        ? LogLevel.error
        : LogLevel.debug;
    logger(level, 'AI_LOG', '$emoji ${entry.action} (${entry.phase}) ${entry.noteId ?? ''}');
  }

  Future<void> _persist() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final json = jsonEncode([for (final e in _entries) e.toJson()]);
      await sp.setString(_storageKey, json);
    } catch (_) {}
  }

  /// Loads the persisted log (shape-guarded; malformed logs are discarded).
  Future<void> load() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final raw = sp.getString(_storageKey);
      if (raw == null || raw.isEmpty) return;
      final decoded = jsonDecode(raw);
      if (decoded is! List) return;
      _entries.clear();
      for (final item in decoded) {
        if (item is Map<String, dynamic>) {
          final entry = AiLogEntry.fromJson(item);
          if (entry != null) _entries.add(entry);
        }
      }
    } catch (_) {
      _entries.clear();
    }
  }
}
