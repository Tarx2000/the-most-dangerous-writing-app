import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/models/saved_vlog.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/ui/features/feed/feed_card.dart';
import 'package:mda_flutter/ui/features/feed/feed_screen.dart';

const _vlog = SavedVlog(
  id: 'clip-1',
  filePath: '/missing.mp4',
  dateStr: '2026-09-17',
  timestamp: 1,
  durationSec: 65,
);

class _Storage extends StorageNotifier {
  @override
  AppData build() => const AppData(isLoaded: true, vlogs: [_vlog]);

  @override
  Future<void> toggleBookmark(String id) async {
    final ids = [...state.feed.bookmarkedNoteIds];
    ids.contains(id) ? ids.remove(id) : ids.add(id);
    state = state.copyWith(feed: state.feed.copyWith(bookmarkedNoteIds: ids));
  }

  @override
  Future<void> saveFeedComment(String id, String comment) async {
    state = state.copyWith(
      feed: state.feed.copyWith(
        feedComments: {...state.feed.feedComments, id: comment},
      ),
    );
  }
}

void main() {
  testWidgets('vlog actions use vlog ID and fullscreen callback', (
    tester,
  ) async {
    SavedVlog? opened;
    final container = ProviderContainer(
      overrides: [appDataProvider.overrideWith(_Storage.new)],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: SizedBox(
                width: 300,
                child: FeedCard(
                  item: const FeedItemData(
                    type: FeedItemType.clip,
                    timestamp: 1,
                    vlog: _vlog,
                  ),
                  onOpenEntry: (_) {},
                  onOpenVlog: (vlog) => opened = vlog,
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('2 min'), findsOneWidget);
    await tester.tap(find.byTooltip('Open video'));
    expect(opened?.id, 'clip-1');
    await tester.tap(find.bySemanticsLabel('Bookmark entry'));
    await tester.pump();
    expect(container.read(feedDataProvider).bookmarkedNoteIds, ['clip-1']);
    await tester.tap(find.bySemanticsLabel('Comment on entry'));
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'Remember this');
    await tester.tap(find.text('Save'));
    await tester.pump();
    expect(container.read(feedDataProvider).feedComments, {
      'clip-1': 'Remember this',
    });
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'bookmark filter excludes unbookmarked vlogs and reacts to changes',
    (tester) async {
      final container = ProviderContainer(
        overrides: [appDataProvider.overrideWith(_Storage.new)],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: Scaffold(body: FeedScreen())),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('All'));
      await tester.pumpAndSettle();
      expect(find.text('Nothing here yet'), findsOneWidget);
      await container.read(appDataProvider.notifier).toggleBookmark('clip-1');
      await tester.pumpAndSettle();
      expect(find.byType(FeedCard), findsOneWidget);
      await container.read(appDataProvider.notifier).toggleBookmark('clip-1');
      await tester.pumpAndSettle();
      expect(find.text('Nothing here yet'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
