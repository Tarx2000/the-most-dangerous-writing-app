/// Minimal logger ported from `src/lib/logger.ts`.
/// Levels: error always shown; warn only in dev/logMode; info/debug only in logMode.
library;

import 'package:flutter/foundation.dart';

bool _logMode = kDebugMode;

/// Sets verbose logging mode (settings pref `LOG_MODE`).
void setLogMode(bool enabled) => _logMode = enabled;

bool getLogMode() => _logMode;

enum LogLevel { debug, info, warn, error }

void _log(LogLevel level, String tag, String message, [Object? extra]) {
  final show = level == LogLevel.error ||
      (level == LogLevel.warn && (_logMode || kDebugMode)) ||
      (level != LogLevel.error && _logMode);
  if (!show) return;
  final prefix = switch (level) {
    LogLevel.error => '❌',
    LogLevel.warn => '⚠️',
    LogLevel.info => 'ℹ️',
    LogLevel.debug => '🐞',
  };
  // ignore: avoid_print
  print('$prefix [$tag] $message${extra != null ? ' $extra' : ''}');
}

/// Generic logger.
void logger(LogLevel level, String tag, String message, [Object? extra]) =>
    _log(level, tag, message, extra);

/// Tagged helpers matching the RN logger.
final logStorage = _tagged('STORAGE');
final logAi = _tagged('AI');
final logAiQueue = _tagged('AI_QUEUE');
final logCompressor = _tagged('COMPRESSOR');
final logDb = _tagged('DB');
final logStartup = _tagged('STARTUP');
final logVlog = _tagged('VLOG');

LogFunction _tagged(String tag) => LogFunction(tag);

/// A small callable wrapper so `logDb.info('msg')` reads like the RN API.
class LogFunction {
  LogFunction(this.tag);

  final String tag;

  void error(String message, [Object? extra]) => _log(LogLevel.error, tag, message, extra);
  void warn(String message, [Object? extra]) => _log(LogLevel.warn, tag, message, extra);
  void info(String message, [Object? extra]) => _log(LogLevel.info, tag, message, extra);
  void debug(String message, [Object? extra]) => _log(LogLevel.debug, tag, message, extra);
}
