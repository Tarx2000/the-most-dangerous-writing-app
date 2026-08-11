/// AI service tests — error classification, SSE streaming, prompts,
/// grammar parsing (parity with `aiService.test.ts` + `aiErrorClassification.test.ts`).
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mda_flutter/data/services/ai_config.dart';
import 'package:mda_flutter/data/services/ai_error.dart';
import 'package:mda_flutter/data/services/ai_service.dart';

const _config = AiConfig(
  provider: AiProvider.ollama,
  apiKey: 'test-key',
  baseUrl: 'https://ollama.com/v1/',
  model: 'gemma4:31b-cloud',
  grammarModel: '',
);

/// Builds an SSE streamed response from raw chunks.
http.StreamedResponse _sseResponse(List<String> sseLines,
    {int status = 200, int delayMs = 5}) {
  final controller = StreamController<List<int>>();
  Future.microtask(() async {
    for (final line in sseLines) {
      controller.add(utf8.encode('$line\n'));
      await Future<void>.delayed(Duration(milliseconds: delayMs));
    }
    await controller.close();
  });
  return http.StreamedResponse(controller.stream, status);
}

/// MockClient can't stream — this BaseClient returns raw StreamedResponses.
class _StreamingMockClient extends http.BaseClient {
  _StreamingMockClient(this.handler);

  final Future<http.StreamedResponse> Function(http.BaseRequest request) handler;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) => handler(request);
}

AiService _serviceReturning(List<String> sseLines, {int status = 200}) {
  return AiService(
    client: _StreamingMockClient((request) async {
      if (status != 200) {
        return http.StreamedResponse(Stream.empty(), status);
      }
      return _sseResponse(sseLines);
    }),
  );
}

void main() {
  group('classifyHttpStatus', () {
    test('maps status codes to kinds', () {
      expect(classifyHttpStatus(401).kind, AiErrorKind.auth);
      expect(classifyHttpStatus(403).kind, AiErrorKind.auth);
      expect(classifyHttpStatus(429).kind, AiErrorKind.rateLimit);
      expect(classifyHttpStatus(500).kind, AiErrorKind.server);
      expect(classifyHttpStatus(502).kind, AiErrorKind.server);
      expect(classifyHttpStatus(404).kind, AiErrorKind.config);
    });
  });

  group('classifyError', () {
    test('string heuristics', () {
      expect(classifyError(Exception('cancelled')).kind, AiErrorKind.cancelled);
      expect(classifyError(Exception('Request timed out')).kind, AiErrorKind.timeout);
      expect(classifyError(Exception('Network request failed')).kind, AiErrorKind.network);
      expect(classifyError(Exception('connection refused')).kind, AiErrorKind.network);
      expect(classifyError(Exception('401 Unauthorized')).kind, AiErrorKind.auth);
      expect(classifyError(Exception('429 Too Many Requests')).kind, AiErrorKind.rateLimit);
      expect(classifyError(Exception('HTTP 503')).kind, AiErrorKind.server);
      expect(classifyError(Exception('garbage')).kind, AiErrorKind.parse);
    });
  });

  group('isRetryableKind', () {
    test('retryable vs permanent', () {
      expect(isRetryableKind(AiErrorKind.network), isTrue);
      expect(isRetryableKind(AiErrorKind.timeout), isTrue);
      expect(isRetryableKind(AiErrorKind.server), isTrue);
      expect(isRetryableKind(AiErrorKind.rateLimit), isTrue);
      expect(isRetryableKind(AiErrorKind.auth), isFalse);
      expect(isRetryableKind(AiErrorKind.config), isFalse);
      expect(isRetryableKind(AiErrorKind.cancelled), isFalse);
      expect(isRetryableKind(AiErrorKind.parse), isFalse);
    });
  });

  group('streamChat', () {
    test('streams deltas with the OpenAI delta shape', () async {
      final service = _serviceReturning([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" world"}}]}',
        'data: [DONE]',
      ]);
      var received = '';
      await service.streamChat(
        config: _config,
        systemPrompt: 'sys',
        userMessage: 'hi',
        onChunk: (partial) => received = partial,
      );
      expect(received, 'Hello world');
    });

    test('supports the Ollama native message shape', () async {
      final service = _serviceReturning([
        'data: {"message":{"content":"Native"}}',
        'data: [DONE]',
      ]);
      var received = '';
      await service.streamChat(
        config: _config,
        systemPrompt: 'sys',
        userMessage: 'hi',
        onChunk: (partial) => received = partial,
      );
      expect(received, 'Native');
    });

    test('non-200 response → classified error', () async {
      final service = _serviceReturning(const [], status: 429);
      expect(
        () => service.streamChat(
          config: _config,
          systemPrompt: 'sys',
          userMessage: 'hi',
          onChunk: (_) {},
        ),
        throwsA(isA<AiError>().having((e) => e.kind, 'kind', AiErrorKind.rateLimit)),
      );
    });

    test('cancellation token aborts mid-stream', () async {
      // Long, slow stream so the cancel lands mid-flight.
      final service = AiService(
        client: _StreamingMockClient((request) async => _sseResponse([
              for (var i = 0; i < 50; i++)
                'data: {"choices":[{"delta":{"content":"token$i "}}]}',
            ], delayMs: 20)),
      );
      final token = AiCancelToken();
      final future = service.streamChat(
        config: _config,
        systemPrompt: 'sys',
        userMessage: 'hi',
        onChunk: (_) {},
        cancelToken: token,
      );
      await Future<void>.delayed(const Duration(milliseconds: 120));
      token.cancel();
      await expectLater(
        future,
        throwsA(isA<AiError>().having((e) => e.kind, 'kind', AiErrorKind.cancelled)),
      );
    });
  });

  group('generateTitle', () {
    test('strips surrounding quotes', () async {
      final service = _serviceReturning([
        'data: {"choices":[{"delta":{"content":"\\"The \\u0027Title\\u0027\\""}}]}',
      ]);
      // Simpler: return with literal quotes.
      final service2 = AiService(
        client: _StreamingMockClient((request) async => _sseResponse([
              'data: {"choices":[{"delta":{"content":"\\"My Title\\""}}]}',
            ])),
      );
      final title = await service2.generateTitle(
        config: _config,
        text: 'some entry text',
        onChunk: (_) {},
      );
      expect(title, 'My Title');
      expect(service, isA<AiService>());
    });
  });

  group('generateSummary', () {
    test('splits bullets and clamps to 5', () async {
      final service = AiService(
        client: _StreamingMockClient((request) async => _sseResponse([
              'data: {"choices":[{"delta":{"content":"• one\\n- two\\n* three\\nfour\\nfive\\nsix\\nseven"}}]}',
            ])),
      );
      final bullets = await service.generateSummary(
        config: _config,
        text: 'long text',
        onChunk: (_) {},
      );
      expect(bullets, ['one', 'two', 'three', 'four', 'five']);
    });
  });

  group('checkGrammar', () {
    test('[] means no issues', () async {
      final service = AiService(
        client: _StreamingMockClient((request) async => _sseResponse([
              'data: {"choices":[{"delta":{"content":"[]"}}]}',
            ])),
      );
      final result = await service.checkGrammar(config: _config, text: 'clean');
      expect(result, isEmpty);
    });

    test('parses suggestion objects', () async {
      final service = AiService(
        client: _StreamingMockClient((request) async => _sseResponse([
              'data: {"choices":[{"delta":{"content":"[{\\"original\\":\\"teh\\",\\"suggestion\\":\\"the\\",\\"explanation\\":\\"typo\\"}]"}}]}',
            ])),
      );
      final result = await service.checkGrammar(config: _config, text: 'teh cat');
      expect(result.single.original, 'teh');
      expect(result.single.suggestion, 'the');
    });

    test('garbage → parse error (never "no issues")', () async {
      final service = AiService(
        client: _StreamingMockClient((request) async => _sseResponse([
              'data: {"choices":[{"delta":{"content":"not json"}}]}',
            ])),
      );
      expect(
        () => service.checkGrammar(config: _config, text: 'x'),
        throwsA(isA<AiError>().having((e) => e.kind, 'kind', AiErrorKind.parse)),
      );
    });
  });

  group('processNote', () {
    test('reports failed when the title is empty', () async {
      final service = AiService(
        client: _StreamingMockClient((request) async {
          final req = request as http.Request;
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          final system = (body['messages'] as List).first['content'] as String;
          final isTitle = system.contains('title generator');
          return _sseResponse([
            'data: {"choices":[{"delta":{"content":"${isTitle ? '' : '• bullet'}"}}]}',
          ]);
        }),
      );
      final result = await service.processNote(config: _config, text: 'entry');
      expect(result.failed, isTrue);
    });
  });

  group('pingServer', () {
    test('v1 URLs hit /models; native Ollama hits /api/version', () async {
      String? requestedPath;
      final service = AiService(
        client: _StreamingMockClient((request) async {
          requestedPath = request.url.path;
          return http.StreamedResponse(Stream.empty(), 200);
        }),
      );
      expect(await service.pingServer(_config), isTrue);
      expect(requestedPath, '/v1/models');

      final native = AiService(
        client: _StreamingMockClient((request) async {
          requestedPath = request.url.path;
          return http.StreamedResponse(Stream.empty(), 200);
        }),
      );
      expect(
        await native.pingServer(const AiConfig(
          provider: AiProvider.ollama,
          apiKey: 'k',
          baseUrl: 'https://ollama.com',
          model: 'm',
          grammarModel: '',
        )),
        isTrue,
      );
      expect(requestedPath, '/api/version');
    });

    test('neuralwatt without key fails fast with config kind', () async {
      final service = AiService(
          client: _StreamingMockClient((_) async => throw StateError('unused')));
      expect(
        () => service.pingServer(const AiConfig(
          provider: AiProvider.neuralwatt,
          apiKey: '',
          baseUrl: AiDefaults.neuralwattBaseUrl,
          model: 'glm-5.2',
          grammarModel: '',
        )),
        throwsA(isA<AiError>().having((e) => e.kind, 'kind', AiErrorKind.config)),
      );
    });
  });
}
