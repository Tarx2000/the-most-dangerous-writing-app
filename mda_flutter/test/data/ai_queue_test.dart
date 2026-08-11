/// AI queue tests — retry rules, permanent failures, pre-flight gates,
/// offline handling, cancellation (parity with `aiQueue.test.ts`).
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mda_flutter/data/models/saved_note.dart';
import 'package:mda_flutter/data/queues/ai_queue.dart';
import 'package:mda_flutter/data/services/ai_config.dart';
import 'package:mda_flutter/data/services/ai_logger.dart';
import 'package:mda_flutter/data/services/ai_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Streaming mock client with a per-call scripted behavior.
/// Only `/chat/completions` requests consume the status script; health-check
/// pings (`/models`, `/api/version`) always answer 200.
class _ScriptedClient extends http.BaseClient {
  _ScriptedClient(this.statuses, {this.pingStatus = 200});

  final List<int> statuses;

  /// Status for health-check pings (default 200 = server recovers).
  final int pingStatus;
  int calls = 0;
  int chatCalls = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final isChat = request.url.path.endsWith('/chat/completions');
    calls++;
    if (isChat) chatCalls++;
    final status = !isChat
        ? pingStatus
        : statuses.length > chatCalls - 1
            ? statuses[chatCalls - 1]
            : statuses.last;
    final controller = StreamController<List<int>>();
    Future.microtask(() async {
      // 429/401/500 → error body; 200 → a slow SSE result so mid-stream
      // cancellation can be observed in tests.
      if (status == 200 && isChat) {
        for (final line in [
          'data: {"choices":[{"delta":{"content":"The "}}]}',
          'data: {"choices":[{"delta":{"content":"Title"}}]}',
          'data: {"choices":[{"delta":{"content":"\n• Summary"}}]}',
          'data: [DONE]',
        ]) {
          controller.add(utf8.encode('$line\n'));
          await Future<void>.delayed(const Duration(milliseconds: 200));
        }
      }
      await controller.close();
    });
    return http.StreamedResponse(controller.stream, status);
  }
}

class _FakeDeps {
  final Map<String, SavedNote> notes = {};
  int updateCount = 0;

  late final AiQueueDeps deps = AiQueueDeps(
    loadNotes: () async => notes.values.toList(),
    getNote: (id) async => notes[id],
    updateNote: (id, updates) async {
      updateCount++;
      final note = notes[id];
      if (note != null) {
        notes[id] = note.copyWith(
          aiTitle: () => updates['ai_title'] as String?,
          aiModelUsed: () => updates['ai_model_used'] as String?,
        );
      }
    },
    getPersonName: (_) async => null,
  );
}

AiConfig _config({String apiKey = 'key'}) => AiConfig(
      provider: 'ollama',
      apiKey: apiKey,
      baseUrl: 'https://ollama.com/v1',
      model: 'gemma4:31b-cloud',
      grammarModel: '',
    );

SavedNote _longNote(String id, {String? personId}) => SavedNote(
      id: id,
      text: List.generate(50, (i) => 'word$i').join(' '),
      dateStr: '2026-08-11',
      timestamp: DateTime.now().millisecondsSinceEpoch,
      durationMin: 5,
      won: true,
      personId: personId,
    );

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('retryable server errors retry twice then fail with notification', () async {
    final client = _ScriptedClient([500, 500, 500]);
    final deps = _FakeDeps();
    final note = _longNote('n1');
    deps.notes[note.id] = note;

    final manager = AiQueueManager(
      service: AiService(client: client),
      deps: deps.deps,
      logger: AiLogger(),
      healthCheckIntervalMs: 150,
    );
    await manager.initialize(_config());
    manager.enqueueNote(note.id, 'journal');

    // 3 attempts (initial + 2 retries); health checks resume the queue
    // after each server-error pause.
    await Future<void>.delayed(const Duration(milliseconds: 4000));
    expect(client.chatCalls, 3);
    final job = manager.jobs.single;
    expect(job.status, 'failed');
    expect(job.retryCount, 2);
    expect(manager.notifications, hasLength(1));
    expect(manager.notifications.single.noteId, note.id);
    await manager.shutdown();
  });

  test('auth errors fail fast without retries', () async {
    final client = _ScriptedClient([401]);
    final deps = _FakeDeps();
    deps.notes['n1'] = _longNote('n1');

    final manager = AiQueueManager(
      service: AiService(client: client),
      deps: deps.deps,
      logger: AiLogger(),
      healthCheckIntervalMs: 150,
    );
    await manager.initialize(_config());
    manager.enqueueNote('n1', 'journal');
    await Future<void>.delayed(const Duration(milliseconds: 800));

    expect(client.chatCalls, 1);
    expect(manager.jobs.single.status, 'failed');
    expect(manager.notifications.single.isPermanent, isTrue);
    expect(manager.notifications.single.errorKind, 'auth');
    await manager.shutdown();
  });

  test('server errors mark the queue offline and pause it', () async {
    // Pings stay failing too, so the queue never resumes in this window.
    final client = _ScriptedClient([500], pingStatus: 500);
    final deps = _FakeDeps();
    deps.notes['n1'] = _longNote('n1');
    deps.notes['n2'] = _longNote('n2');

    final manager = AiQueueManager(
      service: AiService(client: client),
      deps: deps.deps,
      logger: AiLogger(),
      healthCheckIntervalMs: 150,
    );
    await manager.initialize(_config());
    manager.enqueueNote('n1', 'journal');
    manager.enqueueNote('n2', 'journal');
    await Future<void>.delayed(const Duration(milliseconds: 4000));

    // First failure puts the queue offline; with pings failing too, no
    // retries happen and n2 stays queued (SPEC: pause until server is back).
    expect(client.chatCalls, 1);
    expect(manager.state.value.serverOnline, isFalse);
    expect(manager.state.value.pendingCount, 2);
    await manager.shutdown();
  });

  test('success writes AI metadata and marks done', () async {
    final client = _ScriptedClient([200]);
    final deps = _FakeDeps();
    deps.notes['n1'] = _longNote('n1');

    final manager = AiQueueManager(
      service: AiService(client: client),
      deps: deps.deps,
      logger: AiLogger(),
      healthCheckIntervalMs: 150,
    );
    await manager.initialize(_config());
    manager.enqueueNote('n1', 'journal');
    await Future<void>.delayed(const Duration(milliseconds: 2500));

    expect(manager.jobs.single.status, 'done');
    expect(deps.updateCount, 1);
    expect(deps.notes['n1']!.aiTitle, isNotEmpty);
    expect(deps.notes['n1']!.aiModelUsed, 'gemma4:31b-cloud');
    await manager.shutdown();
  });

  test('tweets and short entries are skipped without a server call', () async {
    final client = _ScriptedClient([200]);
    final deps = _FakeDeps();
    deps.notes['tweet'] = SavedNote(
      id: 'tweet',
      text: 'short tweet',
      dateStr: '2026-08-11',
      timestamp: 1,
      durationMin: 0,
      won: false,
      isTweet: true,
    );
    deps.notes['short'] = _longNote('short').copyWith(
      text: 'too short for ai',
    );

    final manager = AiQueueManager(
      service: AiService(client: client),
      deps: deps.deps,
      logger: AiLogger(),
      healthCheckIntervalMs: 150,
    );
    await manager.initialize(_config());
    manager.enqueueNote('tweet', 'journal');
    manager.enqueueNote('short', 'journal');
    await Future<void>.delayed(const Duration(milliseconds: 1600));

    expect(client.chatCalls, 0);
    expect(manager.jobs.every((j) => j.status == 'done'), isTrue);
    await manager.shutdown();
  });

  test('missing API key fails immediately and permanently', () async {
    final client = _ScriptedClient([200]);
    final deps = _FakeDeps();
    deps.notes['n1'] = _longNote('n1');

    final manager = AiQueueManager(
      service: AiService(client: client),
      deps: deps.deps,
      logger: AiLogger(),
      healthCheckIntervalMs: 150,
    );
    await manager.initialize(_config(apiKey: ''));
    manager.enqueueNote('n1', 'journal');
    await Future<void>.delayed(const Duration(milliseconds: 800));

    expect(client.chatCalls, 0);
    expect(manager.jobs.single.status, 'failed');
    expect(manager.notifications.single.isPermanent, isTrue);
    await manager.shutdown();
  });

  test('cancellation (pause) requeues without a failure notification', () async {
    final client = _ScriptedClient([200]);
    final deps = _FakeDeps();
    deps.notes['n1'] = _longNote('n1');

    final manager = AiQueueManager(
      service: AiService(client: client),
      deps: deps.deps,
      logger: AiLogger(),
      healthCheckIntervalMs: 150,
    );
    await manager.initialize(_config());
    manager.enqueueNote('n1', 'journal');
    // Let the job start (500 ms rate limit), then pause mid-flight.
    await Future<void>.delayed(const Duration(milliseconds: 700));
    manager.pause(); // cancels in-flight request

    await Future<void>.delayed(const Duration(milliseconds: 800));
    expect(manager.notifications, isEmpty);
    expect(manager.jobs.single.status, 'queued');
    await manager.shutdown();
  });

  test('batch order is journal → circle → checkin', () async {
    final client = _ScriptedClient([200]);
    final deps = _FakeDeps();
    deps.notes['checkin'] =
        _longNote('checkin').copyWith(isAlignmentReflection: true);
    deps.notes['circle'] = _longNote('circle', personId: 'p1');
    deps.notes['journal'] = _longNote('journal');
    deps.notes['journal2'] = _longNote('journal2');

    final manager = AiQueueManager(
      service: AiService(client: client),
      deps: deps.deps,
      logger: AiLogger(),
      healthCheckIntervalMs: 150,
    );
    await manager.initialize(_config());
    await manager.enqueueBatch();
    await Future<void>.delayed(const Duration(milliseconds: 8000));

    // processNote = title + summary → 2 chat calls per note.
    expect(client.chatCalls, 8);
    final processed = manager.jobs.map((j) => j.noteId).toList();
    expect(processed.indexOf('journal'), lessThan(processed.indexOf('circle')));
    expect(processed.indexOf('circle'), lessThan(processed.indexOf('checkin')));
    await manager.shutdown();
  });

  test('enqueueNote dedupes the same note', () async {
    final manager = AiQueueManager(
      service: AiService(client: _ScriptedClient([200])),
      deps: _FakeDeps().deps,
      logger: AiLogger(),
      healthCheckIntervalMs: 150,
    );
    await manager.initialize(_config());
    manager.enqueueNote('n1', 'journal');
    manager.enqueueNote('n1', 'journal');
    expect(manager.jobs.where((j) => j.status == 'queued').length, 1);
    await manager.shutdown();
  });
}
