/// Integration test: saveEntry through the StorageNotifier (streak rules,
/// tweet auto-classification, persistence) — parity with storageOps tests.
library;

import 'dart:convert' show jsonEncode;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/database/db.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/data/services/settings_service.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// In-memory prefs stub (SharedPreferences stand-in for tests).
class _PrefsStub {
  final Map<String, Object> values = {};

  Future<Map<String, Object>?> read() async => Map.of(values);
  Future<void> write(String key, Object value) async => values[key] = value;
}

/// A text with > 45 words so it is NOT auto-classified as a tweet.
String longText() => List.generate(50, (i) => 'word$i').join(' ');

void main() {
  late _PrefsStub prefs;

  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    setDatabasePathForTest(inMemoryDatabasePath);
  });

  setUp(() {
    prefs = _PrefsStub();
    setPrefsAccess(prefs.read, prefs.write);
  });

  tearDown(() async {
    await closeDb();
  });

  /// Seeds a streak that ends "yesterday" so today's win extends it.
  Future<void> seedStreak(ProviderContainer container, {int streak = 3}) async {
    final yesterday = DateTime.now().subtract(const Duration(days: 1));
    final yStr =
        '${yesterday.year.toString().padLeft(4, '0')}-${yesterday.month.toString().padLeft(2, '0')}-${yesterday.day.toString().padLeft(2, '0')}';
    final settings = container.read(settingsServiceProvider);
    await settings.setRaw(SettingsKeys.currentStreak, '$streak');
    await settings.setRaw(SettingsKeys.lastWinDate, yStr);
    await settings.setRaw(SettingsKeys.streakHistory, jsonEncode([yStr]));
    await container.read(appDataProvider.notifier).loadAll();
  }

  test('first eligible win starts a streak with popup', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(appDataProvider.notifier);
    await notifier.loadAll();

    final result = await notifier.saveEntry(
      text: longText(),
      won: true,
      durationMin: 5,
    );

    expect(result.streakIncreased, isTrue);
    expect(result.newStreak, 1);
    expect(container.read(pendingStreakPopupProvider)?.streak, 1);

    final notes = container.read(notesProvider);
    expect(notes.length, 1);
    expect(notes.first.isTweet, isFalse);
  });

  test('consecutive day win increments the streak', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(appDataProvider.notifier);
    await seedStreak(container);

    final result = await notifier.saveEntry(
      text: longText(),
      won: true,
      durationMin: 5,
    );

    expect(result.newStreak, 4);
    expect(result.streakIncreased, isTrue);
    expect(container.read(streakProvider).currentStreak, 4);
  });

  test('short entries are auto-classified as tweets and never affect streak', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(appDataProvider.notifier);
    await notifier.loadAll();

    final result = await notifier.saveEntry(
      text: 'a short tweet',
      won: false,
      durationMin: 0,
    );

    expect(result.note.isTweet, isTrue);
    expect(result.streakIncreased, isFalse);
    expect(container.read(streakProvider).currentStreak, 0);
  });

  test('lost sessions do not extend the streak', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(appDataProvider.notifier);
    await notifier.loadAll();

    final result = await notifier.saveEntry(
      text: 'I lost this one.',
      won: false,
      durationMin: 5,
    );

    expect(result.streakIncreased, isFalse);
    expect(result.newStreak, 0);
  });

  test('streak survives a reload (settings persisted)', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(appDataProvider.notifier);
    await notifier.loadAll();
    await notifier.saveEntry(
      text: longText(),
      won: true,
      durationMin: 3,
    );

    // Fresh load from the persisted settings.
    await container.read(appDataProvider.notifier).loadAll();
    expect(container.read(streakProvider).currentStreak, 1);
    expect(container.read(streakProvider).lastWinDate, isNotEmpty);
  });
}
