import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mda_flutter/core/theme/mdi.dart';
import 'package:mda_flutter/data/ai_providers.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/models/saved_note.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/data/queues/ai_queue.dart';
import 'package:mda_flutter/data/services/ai_logger.dart';
import 'package:mda_flutter/data/services/ai_service.dart';
import 'package:mda_flutter/ui/features/library/note_viewer_modal.dart';
import 'package:mda_flutter/ui/features/post_writing/post_writing_screen.dart';

final _note = SavedNote(
  id: 'entry',
  text: List.filled(50, 'word').join(' '),
  dateStr: '2026-09-17',
  timestamp: 1,
  durationMin: 5,
  won: true,
);

class _Storage extends StorageNotifier {
  @override
  AppData build() => AppData(
    isLoaded: true,
    notes: [_note],
    preferences: const PreferencesState(autoGenerateSummaries: false),
  );

  @override
  Future<void> updateNote(String id, Map<String, Object?> updates) async {
    state = state.copyWith(
      notes: [
        for (final note in state.notes)
          if (note.id == id)
            note.copyWith(
              text: updates['text'] as String?,
              aiTitle: () => updates['ai_title'] as String?,
              aiSummary: updates['ai_summary'] as List<String>?,
            )
          else
            note,
      ],
    );
  }

  @override
  Future<void> deleteNote(String id) async {
    state = state.copyWith(
      notes: state.notes.where((note) => note.id != id).toList(),
    );
  }
}

AiQueueManager _queue() => AiQueueManager(
  service: AiService(),
  logger: AiLogger(),
  deps: AiQueueDeps(
    loadNotes: () async => [_note],
    getNote: (_) async => _note,
    updateNote: (_, _) async {},
    getPersonName: (_) async => null,
  ),
)..pause();

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('reader enqueues real AI work and shows live saved results', (
    tester,
  ) async {
    final queue = _queue();
    final container = ProviderContainer(
      overrides: [
        appDataProvider.overrideWith(_Storage.new),
        aiQueueManagerProvider.overrideWithValue(queue),
      ],
    );
    addTearDown(container.dispose);
    addTearDown(queue.shutdown);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          home: NoteViewerModal(note: _note, onClose: () {}),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Generate AI Summary'));
    await tester.pumpAndSettle();
    expect(queue.jobs.single.noteId, 'entry');
    expect(find.text('Queued...'), findsOneWidget);
    queue.cancelJob(queue.jobs.single.id);
    await container.read(appDataProvider.notifier).updateNote('entry', {
      'ai_title': 'A real generated title',
      'ai_summary': ['A saved summary'],
    });
    await tester.pumpAndSettle();
    expect(find.text('A real generated title'), findsOneWidget);
    expect(find.text('Regenerate AI Summary'), findsOneWidget);
    expect(find.text('Queued...'), findsNothing);
    expect(container.read(aiQueueStateProvider).value?.pendingCount, 0);
    await tester.pumpWidget(const SizedBox());
  });

  for (final action in ['save', 'delete']) {
    testWidgets('post-writing $action changes stored entry before closing', (
      tester,
    ) async {
      final queue = _queue();
      final container = ProviderContainer(
        overrides: [
          appDataProvider.overrideWith(_Storage.new),
          aiQueueManagerProvider.overrideWithValue(queue),
        ],
      );
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (_, _) => const Scaffold(body: Text('Home')),
          ),
          GoRoute(
            path: '/entry',
            builder: (_, _) => const PostWritingScreen(noteId: 'entry'),
          ),
        ],
      );
      addTearDown(container.dispose);
      addTearDown(router.dispose);
      addTearDown(queue.shutdown);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      router.push('/entry');
      await tester.pumpAndSettle();
      if (action == 'save') {
        await tester.tap(find.byIcon(Mdi.get('pencilOutline')));
        await tester.pump();
        await tester.enterText(find.byType(TextField), 'Updated entry');
        await tester.tap(find.byIcon(Mdi.get('check')));
        await tester.pumpAndSettle();
        expect(container.read(notesProvider).single.text, 'Updated entry');
      } else {
        await tester.tap(find.byIcon(Mdi.get('trashCanOutline')));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Cancel'));
        await tester.pumpAndSettle();
        expect(container.read(notesProvider), hasLength(1));
        await tester.tap(find.byIcon(Mdi.get('trashCanOutline')));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Delete'));
        await tester.pumpAndSettle();
        expect(container.read(notesProvider), isEmpty);
      }
      expect(find.text('Home'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
