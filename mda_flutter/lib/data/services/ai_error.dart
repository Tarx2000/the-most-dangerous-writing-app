/// AI error classification — port of `aiService.ts` + `.agents/instructions/ai-integration.md`
/// (SPEC §9). Every failure becomes an [AiError] with a stable technical
/// [message] and a user-safe [userMessage] (UIs must display userMessage).
library;

/// Failure kinds (SPEC §9) — the retry policy keys off these.
enum AiErrorKind {
  network,
  timeout,
  server,
  rateLimit,
  auth,
  config,
  cancelled,
  parse,
}

/// Kinds that are safe to retry (SPEC: network|timeout|server|rateLimit).
bool isRetryableKind(AiErrorKind kind) {
  switch (kind) {
    case AiErrorKind.network:
    case AiErrorKind.timeout:
    case AiErrorKind.server:
    case AiErrorKind.rateLimit:
      return true;
    case AiErrorKind.auth:
    case AiErrorKind.config:
    case AiErrorKind.cancelled:
    case AiErrorKind.parse:
      return false;
  }
}

class AiError implements Exception {
  const AiError(this.kind, this.message, {this.userMessage, this.statusCode});

  final AiErrorKind kind;

  /// Technical, stable message (legacy catchers rely on it).
  final String message;

  /// User-safe copy — this is what UIs show, never the raw message.
  final String? userMessage;

  final int? statusCode;

  String get uiMessage => userMessage ?? _defaultUiMessage(kind);

  @override
  String toString() => 'AiError(${kind.name}): $message';
}

/// User-safe fallback per kind (parity with the RN contract).
String _defaultUiMessage(AiErrorKind kind) {
  switch (kind) {
    case AiErrorKind.network:
      return 'Network error — check your connection.';
    case AiErrorKind.timeout:
      return 'The request timed out. Try again.';
    case AiErrorKind.server:
      return 'AI server error. Please try again.';
    case AiErrorKind.rateLimit:
      return 'Rate limit reached — please wait a moment.';
    case AiErrorKind.auth:
      return 'Authentication failed — check your API key.';
    case AiErrorKind.config:
      return 'AI settings are incomplete. Check them in AI Settings.';
    case AiErrorKind.cancelled:
      return 'Request cancelled.';
    case AiErrorKind.parse:
      return 'Could not understand the AI response. Please retry.';
  }
}

/// Classifies an HTTP status (SPEC §9: 401/403→auth, 429→rateLimit,
/// 5xx→server, other 4xx→config).
AiError classifyHttpStatus(int statusCode) {
  final kind = switch (statusCode) {
    401 || 403 => AiErrorKind.auth,
    429 => AiErrorKind.rateLimit,
    >= 500 => AiErrorKind.server,
    >= 400 => AiErrorKind.config,
    _ => AiErrorKind.server,
  };
  return AiError(kind, 'HTTP $statusCode', statusCode: statusCode);
}

/// String-heuristic classification for non-HTTP failures (SPEC §9).
AiError classifyError(Object error) {
  final text = error.toString().toLowerCase();

  if (text.contains('cancelled') || text.contains('aborted')) {
    return const AiError(AiErrorKind.cancelled, 'cancelled');
  }
  if (text.contains('timed out') || text.contains('timeout')) {
    return const AiError(AiErrorKind.timeout, 'timed out');
  }
  if (text.contains('network request failed') ||
      text.contains('connection dropped') ||
      text.contains('unreachable') ||
      text.contains('connection refused') ||
      text.contains('socketexception')) {
    return const AiError(AiErrorKind.network, 'network failure');
  }
  if (text.contains('401') || text.contains('403') || text.contains('auth')) {
    return const AiError(AiErrorKind.auth, 'auth failure',
        userMessage: 'Authentication failed — check your API key.');
  }
  if (text.contains('429')) {
    return const AiError(AiErrorKind.rateLimit, 'rate limited',
        userMessage: 'Rate limit reached — please wait a moment.');
  }
  if (RegExp(r'[5]\d\d').hasMatch(text)) {
    return const AiError(AiErrorKind.server, 'server error');
  }
  return const AiError(AiErrorKind.parse, 'unparseable response');
}
