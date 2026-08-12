/// App smoke test — the shell renders and boots without crashing.
/// Storage is faked (no DB): testWidgets runs in FakeAsync where real
/// sqlite I/O would block.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/app.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/providers.dart';

void main() {
  testWidgets('app shell renders without crashing', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        appDataProvider.overrideWith(() => _FakeStorageNotifier()),
      ],
      child: const MdaApp(),
    ));

    // Initial frame renders (storage is pre-loaded in the fake).
    expect(find.text('FREE WRITING'), findsOneWidget);
    expect(find.text('START WRITING'), findsOneWidget);

    await tester.pump();
    expect(find.text('START WRITING'), findsOneWidget);
  });
}

/// StorageNotifier stand-in with a pre-loaded empty state.
class _FakeStorageNotifier extends StorageNotifier {
  @override
  AppData build() => const AppData(isLoaded: true);
}
