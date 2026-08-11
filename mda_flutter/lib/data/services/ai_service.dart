/// AI service — OpenAI-compatible streaming client for Ollama Cloud and
/// Neuralwatt (port of `src/lib/aiService.ts`, SPEC §9).
///
/// Streaming: `http.Client().send()` returns a byte stream we split into SSE
/// lines (the Dart equivalent of the RN XHR line-buffer). Chunks are flushed
/// by the same rule as the RN app (whitespace/CJK punctuation/12-char buffer).
/// `options.num_ctx` is only sent for the Ollama provider.
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'ai_config.dart';
import 'ai_error.dart';

/// Cancellation token (polled every 200 ms — parity with the RN cancel token).
class AiCancelToken {
  AiCancelToken();

  bool _cancelled = false;
  final List<VoidCallback> _listeners = [];

  bool get isCancelled => _cancelled;

  void cancel() {
    _cancelled = true;
    for (final listener in _listeners) {
      listener();
    }
    _listeners.clear();
  }

  void onCancel(VoidCallback callback) {
    if (_cancelled) {
      callback();
    } else {
      _listeners.add(callback);
    }
  }
}

/// Chunk consumer: called with accumulated partial text.
typedef AiChunkConsumer = void Function(String partial);

/// Result of a non-streamed helper call.
class AiTextResult {
  const AiTextResult(this.text);

  final String text;
}

class AiService {
  AiService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  /// Chunk flush rule (SPEC §9): end in whitespace/CJK punctuation or buffer
  /// exceeds 12 chars.
  static final RegExp _flushPattern =
      RegExp(r"[ \t\n.,!?\-:;，。！？、”'一-龥]$");

  // -- Streaming request -----------------------------------------------------

  /// POSTs to `{baseUrl}/chat/completions` (trailing slash stripped) and
  /// streams SSE `choices[0].delta.content` chunks to [onChunk].
  /// Throws [AiError] with the classified kind.
  Future<void> streamChat({
    required AiConfig config,
    required String systemPrompt,
    required String userMessage,
    required AiChunkConsumer onChunk,
    AiCancelToken? cancelToken,
  }) async {
    final baseUrl = config.baseUrl.replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.parse('$baseUrl/chat/completions');
    final body = <String, Object?>{
      'model': config.model,
      'messages': [
        {'role': 'system', 'content': systemPrompt},
        {'role': 'user', 'content': userMessage},
      ],
      'stream': true,
      if (config.provider == AiProvider.ollama) 'options': {'num_ctx': 16384},
    };

    final request = http.Request('POST', uri)
      ..headers['Content-Type'] = 'application/json'
      ..headers['Authorization'] = 'Bearer ${config.apiKey}'
      ..body = jsonEncode(body);

    final cancelCompleter = Completer<void>();
    final timeoutTimer = Timer(const Duration(milliseconds: AiTiming.requestTimeoutMs), () {
      if (!cancelCompleter.isCompleted) cancelCompleter.complete();
    });

    final responseFuture = _client.send(request);    Future<void> drainLateResponse() async {
      try {
        final late = await responseFuture;
        await late.stream.drain<void>();
      } catch (_) {}
    }

    try {
      final response = await Future.any<http.StreamedResponse>([
        responseFuture,
        cancelCompleter.future.then((_) => throw const AiError(AiErrorKind.timeout, 'request timed out')),
      ]);

      timeoutTimer.cancel();

      // Non-2xx → classify and abort (parity: HEADERS_RECEIVED check).
      if (response.statusCode < 200 || response.statusCode >= 300) {
        await response.stream.drain<void>();
        throw classifyHttpStatus(response.statusCode);
      }

      final wordBuffer = StringBuffer();
      // Flush rule (SPEC §9): whitespace, common/CJK punctuation or CJK chars.
      final flushPattern = _flushPattern;

      await for (final chunk in response.stream.transform(utf8.decoder)) {
        if (cancelToken?.isCancelled == true) {
          throw const AiError(AiErrorKind.cancelled, 'cancelled by token');
        }
        for (final line in chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          final payload = line.substring(6).trim();
          if (payload == '[DONE]') continue;
          final delta = _extractDelta(payload);
          if (delta == null || delta.isEmpty) continue;
          wordBuffer.write(delta);
          final buffer = wordBuffer.toString();
          if (buffer.isNotEmpty && (flushPattern.hasMatch(buffer) || buffer.length >= 12)) {
            onChunk(buffer);
            wordBuffer.clear();
          }
        }
      }

      // Flush any remaining buffer.
      final remaining = wordBuffer.toString();
      if (remaining.isNotEmpty) {
        onChunk(remaining);
        wordBuffer.clear();
      }
    } on AiError {
      // Ensure a late-arriving response is drained so the connection closes.
      unawaited(drainLateResponse());
      rethrow;
    } on http.ClientException catch (e) {
      unawaited(drainLateResponse());
      throw classifyError(e);
    } on TimeoutException {
      unawaited(drainLateResponse());
      throw const AiError(AiErrorKind.timeout, 'request timed out');
    } catch (e) {
      unawaited(drainLateResponse());
      throw classifyError(e);
    } finally {
      timeoutTimer.cancel();
      if (!cancelCompleter.isCompleted) cancelCompleter.complete();
    }
  }

  /// Extracts the content delta from an SSE JSON payload (SPEC §9 supports
  /// three shapes: `choices[0].delta.content`, `choices[0].message.content`,
  /// `message.content`).
  static String? _extractDelta(String payload) {
    try {
      final decoded = jsonDecode(payload);
      if (decoded is! Map<String, dynamic>) return null;
      final choices = decoded['choices'];
      if (choices is List && choices.isNotEmpty) {
        final choice = choices.first;
        if (choice is Map<String, dynamic>) {
          final delta = choice['delta'];
          if (delta is Map<String, dynamic> && delta['content'] is String) {
            return delta['content'] as String;
          }
          if (choice['message'] is Map<String, dynamic> &&
              (choice['message'] as Map)['content'] is String) {
            return (choice['message'] as Map)['content'] as String;
          }
        }
      }
      final message = decoded['message'];
      if (message is Map<String, dynamic> && message['content'] is String) {
        return message['content'] as String;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  // -- Generation helpers -----------------------------------------------------

  /// `generateTitle` — strips surrounding quotes from the result.
  Future<String> generateTitle({
    required AiConfig config,
    required String text,
    required AiChunkConsumer onChunk,
    RelationshipContext? relationship,
    AiCancelToken? cancelToken,
  }) async {
    if (text.trim().isEmpty) return '';
    final prompt = _promptFor(config, relationship == null ? 'title' : 'relationshipTitle', relationship);
    var result = '';
    await streamChat(
      config: config,
      systemPrompt: prompt,
      userMessage: text,
      cancelToken: cancelToken,
      onChunk: (partial) {
        result = partial;
        onChunk(partial);
      },
    );
    return result.replaceAll(RegExp("^[\"']+|[\"']+\$"), '');
  }

  /// `generateSummary` — splits bullets, strips list markers, max 5 bullets.
  Future<List<String>> generateSummary({
    required AiConfig config,
    required String text,
    required AiChunkConsumer onChunk,
    RelationshipContext? relationship,
    AiCancelToken? cancelToken,
  }) async {
    if (text.trim().isEmpty) return const [];
    final prompt = _promptFor(config, relationship == null ? 'summary' : 'relationshipSummary', relationship);
    var result = '';
    await streamChat(
      config: config,
      systemPrompt: prompt,
      userMessage: text,
      cancelToken: cancelToken,
      onChunk: (partial) {
        result = partial;
        onChunk(partial);
      },
    );
    final bullets = result
        .split('\n')
        .map((line) => line.replaceFirst(RegExp(r'^[\s•\-*]+'), '').trim())
        .where((line) => line.isNotEmpty)
        .take(5)
        .toList();
    return bullets;
  }

  /// `checkGrammar` — parses the JSON array; `[]` is a valid "no issues"
  /// result; garbage throws `AiError('parse')` (SPEC §9).
  Future<List<GrammarSuggestion>> checkGrammar({
    required AiConfig config,
    required String text,
  }) async {
    if (text.trim().isEmpty) return const [];
    var result = '';
    await streamChat(
      config: config.copyWith(model: config.effectiveGrammarModel),
      systemPrompt: _promptFor(config, 'grammar', null),
      userMessage: text,
      onChunk: (partial) => result = partial,
    );
    return _parseGrammar(result);
  }

  static List<GrammarSuggestion> _parseGrammar(String raw) {    var cleaned = raw.trim();
    cleaned = cleaned.replaceFirst(RegExp(r'^```json\s*'), '').replaceFirst(RegExp(r'\s*```$'), '');
    if (cleaned.isEmpty) return const [];
    try {
      final decoded = jsonDecode(cleaned);
      if (decoded is! List) {
        throw const AiError(AiErrorKind.parse, 'grammar response is not an array');
      }
      return [
        for (final item in decoded)
          if (item is Map<String, dynamic> &&
              item['original'] is String &&
              item['suggestion'] is String &&
              item['explanation'] is String)
            GrammarSuggestion(
              original: item['original'] as String,
              suggestion: item['suggestion'] as String,
              explanation: item['explanation'] as String,
            ),
      ];
    } on AiError {
      rethrow;
    } catch (_) {
      throw const AiError(AiErrorKind.parse, 'grammar response unparseable',
          userMessage: "Couldn't check grammar — the AI returned an unexpected response.");
    }
  }

  /// `processNote` — runs title then summary sequentially; `failed: true`
  /// when either came back empty (the queue converts that to a retryable
  /// server error, SPEC §9).
  Future<({String title, List<String> summary, bool failed})> processNote({
    required AiConfig config,
    required String text,
    RelationshipContext? relationship,
    AiCancelToken? cancelToken,
  }) async {
    final title = await generateTitle(
      config: config,
      text: text,
      relationship: relationship,
      cancelToken: cancelToken,
      onChunk: (_) {},
    );
    final summary = await generateSummary(
      config: config,
      text: text,
      relationship: relationship,
      cancelToken: cancelToken,
      onChunk: (_) {},
    );
    return (
      title: title,
      summary: summary,
      failed: title.isEmpty || summary.isEmpty,
    );
  }

  // -- Server connectivity ------------------------------------------------------

  /// `pingServer` — Neuralwatt or `/v1` URLs → `GET {baseUrl}/models`;
  /// otherwise `GET {baseUrl}/api/version` (Ollama native); 5 s timeout.
  Future<bool> pingServer(AiConfig config) async {
    if (config.provider == AiProvider.neuralwatt && config.apiKey.isEmpty) {
      throw const AiError(AiErrorKind.config, 'no neuralwatt key',
          userMessage: 'No Neuralwatt API key set. Add your key in AI Settings.');
    }
    final baseUrl = config.baseUrl.replaceAll(RegExp(r'/+$'), '');
    final isV1 = baseUrl.endsWith('/v1');
    final uri = Uri.parse(isV1 ? '$baseUrl/models' : '$baseUrl/api/version');

    try {
      final request = http.Request('GET', uri);
      if (isV1) {
        request.headers['Authorization'] = 'Bearer ${config.apiKey}';
      }
      final response = await _client.send(request).timeout(const Duration(seconds: 5));
      await response.stream.drain<void>();
      if (response.statusCode >= 200 && response.statusCode < 300) return true;
      throw classifyHttpStatus(response.statusCode);
    } on AiError {
      rethrow;
    } catch (e) {
      throw classifyError(e);
    }
  }

  /// `fetchAvailableModels` — `GET {baseUrl}/models`, 10 s timeout.
  Future<List<String>> fetchAvailableModels(AiConfig config) async {
    final baseUrl = config.baseUrl.replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.parse('$baseUrl/models');
    final request = http.Request('GET', uri)
      ..headers['Authorization'] = 'Bearer ${config.apiKey}';
    final response = await _client.send(request).timeout(const Duration(seconds: 10));
    final body = await response.stream.bytesToString();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw classifyHttpStatus(response.statusCode);
    }
    try {
      final decoded = jsonDecode(body);
      final data = decoded['data'];
      if (data is List) {
        return [for (final item in data) if (item['id'] is String) item['id'] as String];
      }
    } catch (_) {}
    return const [];
  }

  // -- Prompt plumbing ----------------------------------------------------------

  String _promptFor(AiConfig config, String key, RelationshipContext? relationship) {
    var prompt = config.prompts[key] ?? defaultAiPrompts[key] ?? '';
    if (relationship != null) {
      prompt = prompt
          .replaceAll('{{PERSON_NAME}}', relationship.personName)
          .replaceAll('{{RELATIONSHIP_STATUS}}', relationship.relationshipStatus);
    }
    return prompt;
  }
}

/// Grammar suggestion row.
class GrammarSuggestion {
  const GrammarSuggestion({
    required this.original,
    required this.suggestion,
    required this.explanation,
  });

  final String original;
  final String suggestion;
  final String explanation;
}
