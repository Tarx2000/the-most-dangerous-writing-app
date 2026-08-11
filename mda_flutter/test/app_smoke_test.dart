/// App smoke test — the shell renders and boots the storage layer
/// without crashing (parity with the RN `App.test.tsx`).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/app.dart';
import 'package:mda_flutter/data/database/db.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    setDatabasePathForTest(inMemoryDatabasePath);
    setPrefsAccess(() async => {}, (key, value) async {});
  });

  testWidgets('app shell renders and boots without crashing', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: MdaApp()));

    // Initial frame renders (storage boot runs in the background).
    expect(find.text('FREE WRITING'), findsOneWidget);
    expect(find.text('START WRITING'), findsOneWidget);

    // Let the boot complete (critical + deferred loads) — must not crash.
    await tester.pumpAndSettle(const Duration(milliseconds: 500));
    expect(find.text('START WRITING'), findsOneWidget);
  });
}
