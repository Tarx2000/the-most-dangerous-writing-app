/// Riverpod wiring — repository/services providers + the StorageNotifier.
/// Mirrors the RN split-context pattern: one store, granular derived providers
/// so widgets re-render only on their domain.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/haptics.dart';
import '../core/logger.dart';
import '../core/utils.dart';
import 'app_data.dart';
import 'database/repositories/notes_repository.dart';
import 'database/repositories/persons_repository.dart';
import 'database/repositories/pillars_repository.dart';
import 'database/repositories/settings_repository.dart';
import 'database/repositories/vlogs_repository.dart';
import 'models/person.dart';
import 'models/pillar.dart';
import 'models/saved_note.dart';
import 'models/saved_vlog.dart';
import 'services/secure_storage_service.dart';
import 'services/settings_service.dart';

// -- Infrastructure providers ----------------------------------------------

final settingsRepositoryProvider = Provider<SettingsRepository>((ref) => SettingsRepository());

final settingsServiceProvider = Provider<SettingsService>(
  (ref) => SettingsService(ref.watch(settingsRepositoryProvider)),
);

final secureStorageServiceProvider = Provider<SecureStorageService>(
  (ref) => SecureStorageService(),
);

final notesRepositoryProvider = Provider<NotesRepository>((ref) => NotesRepository());

final personsRepositoryProvider = Provider<PersonsRepository>((ref) => PersonsRepository());

final pillarsRepositoryProvider = Provider<PillarsRepository>((ref) => PillarsRepository());

final vlogsRepositoryProvider = Provider<VlogsRepository>((ref) => VlogsRepository());

// -- Domain providers (derived slices of AppData) ---------------------------

final appDataProvider = NotifierProvider<StorageNotifier, AppData>(StorageNotifier.new);

final notesProvider = Provider<List<SavedNote>>((ref) => ref.watch(appDataProvider).notes);

final personsProvider = Provider<List<Person>>((ref) => ref.watch(appDataProvider).persons);

final vlogsProvider = Provider<List<SavedVlog>>((ref) => ref.watch(appDataProvider).vlogs);

final pillarsProvider = Provider<List<Pillar>>((ref) => ref.watch(appDataProvider).pillars);

final adviceCardsProvider =
    Provider<List<AdviceCard>>((ref) => ref.watch(appDataProvider).adviceCards);

final preferencesProvider =
    Provider<PreferencesState>((ref) => ref.watch(appDataProvider).preferences);

final streakProvider = Provider<StreakState>((ref) => ref.watch(appDataProvider).streak);

final feedDataProvider = Provider<FeedState>((ref) => ref.watch(appDataProvider).feed);

final isAppLoadedProvider = Provider<bool>((ref) => ref.watch(appDataProvider).isLoaded);

/// Waits until the storage layer booted (screens gate on this).
final storageReadyProvider = FutureProvider<void>((ref) async {
  await ref.read(appDataProvider.notifier).loadAll();
});

// -- StorageNotifier ---------------------------------------------------------

/// Crash-proof startup: every domain loads independently (allSettled-style);
/// a failing domain can never abort boot. Mirrors `loadAllData()` in the RN app.
class StorageNotifier extends Notifier<AppData> {
  @override
  AppData build() => const AppData();

  Future<void> loadAll() async {
    if (state.isLoaded) return;

    // Phase 1 — critical domains (parallel, individually guarded).
    final results = await Future.wait([
      _loadNotes(),
      _loadPersons(),
      _loadSettings(),
    ]);

    final notes = results[0] as List<SavedNote>;
    final persons = results[1] as List<Person>;
    final prefs = results[2] as PreferencesState;

    // Sync global runtime flags from the loaded preferences.
    setGlobalHapticsEnabled(prefs.enableHaptics);
    setLogMode(prefs.logMode);

    state = state.copyWith(
      notes: notes,
      persons: persons,
      preferences: prefs,
      isLoaded: true,
    );

    // Phase 2 — deferred domains (never block the first frame).
    final deferred = await Future.wait([
      _loadVlogs(),
      _loadPillars(),
      _loadFeed(),
    ]);

    final (pillars, adviceCards, lastLog) = deferred[1] as (List<Pillar>, List<AdviceCard>, int?);

    state = state.copyWith(
      vlogs: deferred[0] as List<SavedVlog>,
      pillars: pillars,
      adviceCards: adviceCards,
      lastLogDate: lastLog,
      feed: deferred[2] as FeedState,
    );
    logStartup.info('loadAllData done');
  }

  Future<List<SavedNote>> _loadNotes() async {
    try {
      return await ref.read(notesRepositoryProvider).getAllNotes();
    } catch (e) {
      logStorage.error('notes load failed', e);
      return [];
    }
  }

  Future<List<Person>> _loadPersons() async {
    try {
      return await ref.read(personsRepositoryProvider).getAllPersons();
    } catch (e) {
      logStorage.error('persons load failed', e);
      return [];
    }
  }

  Future<PreferencesState> _loadSettings() async {
    final service = ref.read(settingsServiceProvider);
    try {
      final lastReflection = await service.getInt(SettingsKeys.lastReflectionDate, 0);
      return PreferencesState(
        fontIndex: await service.getInt(SettingsKeys.userFontIdx, 0),
        sizeIndex: await service.getInt(SettingsKeys.userSizeIdx, 1),
        useBiometrics: await service.getBool(SettingsKeys.useBiometrics, true),
        enableHaptics: await service.getBool(SettingsKeys.enableHaptics, true),
        lockTimeoutMins: await service.getInt(SettingsKeys.lockTimeoutMins, 3),
        vlogQuality: await service.getString(SettingsKeys.vlogQuality, '1080p'),
        compressionPreset:
            await service.getString(SettingsKeys.compressionPreset, 'balanced'),
        devMode: await service.getBool(SettingsKeys.devMode, false),
        debugLayout: await service.getBool(SettingsKeys.debugLayout, false),
        preferPinAuth: await service.getBool(SettingsKeys.preferPinAuth, false),
        logMode: await service.getBool(SettingsKeys.logMode, kDebugMode),
        lastReflectionDate: lastReflection == 0 ? null : lastReflection,
        autoGenerateSummaries:
            await service.getBool(SettingsKeys.autoGenerateSummaries, true),
      );
    } catch (e) {
      logStorage.error('settings load failed', e);
      return const PreferencesState();
    }
  }

  Future<List<SavedVlog>> _loadVlogs() async {
    try {
      return await ref.read(vlogsRepositoryProvider).getAllVlogs();
    } catch (e) {
      logStorage.error('vlogs load failed', e);
      return [];
    }
  }

  /// Returns `(pillars, adviceCards, lastLogDate)` — a tuple via a small record.
  Future<(List<Pillar>, List<AdviceCard>, int?)> _loadPillars() async {
    final repo = ref.read(pillarsRepositoryProvider);
    try {
      final pillars = await repo.getAllPillars();
      final cards = await repo.getAllAdviceCards();
      final lastLog = await repo.getLatestPillarLogTimestamp();
      return (pillars, cards, lastLog);
    } catch (e) {
      logStorage.error('pillars load failed', e);
      return (<Pillar>[], <AdviceCard>[], null);
    }
  }

  Future<FeedState> _loadFeed() async {
    final service = ref.read(settingsServiceProvider);
    try {
      final comments = await service.getJsonMap(SettingsKeys.feedComments, {});
      return FeedState(
        bookmarkedNoteIds: (await service.getJsonList(SettingsKeys.bookmarkedNoteIds, []))
            .whereType<String>()
            .toList(),
        feedComments: comments.map((k, v) => MapEntry(k, '$v')),
        autoPlayFeedVideos: await service.getBool(SettingsKeys.autoPlayFeedVideos, true),
      );
    } catch (e) {
      logStorage.error('feed load failed', e);
      return const FeedState();
    }
  }

  // -- Actions (Phase 2 ports the full optimistic-ops factories) -------------

  Future<void> saveNote(SavedNote note) async {
    final repo = ref.read(notesRepositoryProvider);
    await repo.insertNote(note);
    state = state.copyWith(notes: [note, ...state.notes]);
  }

  Future<void> updateNote(String id, Map<String, Object?> updates) async {
    final repo = ref.read(notesRepositoryProvider);
    await repo.updateNote(id, updates);
    final all = await repo.getAllNotes();
    state = state.copyWith(notes: all);
  }

  Future<void> deleteNote(String id) async {
    final repo = ref.read(notesRepositoryProvider);
    await repo.deleteNote(id);
    state = state.copyWith(notes: [for (final n in state.notes) if (n.id != id) n]);
  }

  Future<String?> addPerson(String name) async {
    final repo = ref.read(personsRepositoryProvider);
    final person = Person(id: generateId(), name: name, createdAt: DateTime.now().millisecondsSinceEpoch);
    try {
      await repo.insertPerson(person);
      state = state.copyWith(persons: [person, ...state.persons]);
      return person.id;
    } catch (e) {
      logStorage.error('addPerson failed', e);
      return null;
    }
  }

  Future<void> updatePerson(String id, Map<String, Object?> updates) async {
    final repo = ref.read(personsRepositoryProvider);
    await repo.updatePerson(id, updates);
    final all = await repo.getAllPersons();
    state = state.copyWith(persons: all);
  }

  Future<void> deletePerson(String id) async {
    final repo = ref.read(personsRepositoryProvider);
    await repo.deletePerson(id);
    state = state.copyWith(persons: [for (final p in state.persons) if (p.id != id) p]);
  }

  Future<void> saveVlog(SavedVlog vlog) async {
    final repo = ref.read(vlogsRepositoryProvider);
    await repo.insertVlog(vlog);
    state = state.copyWith(vlogs: [vlog, ...state.vlogs]);
  }

  Future<void> updateVlog(String id, Map<String, Object?> updates) async {
    final repo = ref.read(vlogsRepositoryProvider);
    await repo.updateVlog(id, updates);
    final all = await repo.getAllVlogs();
    state = state.copyWith(vlogs: all);
  }

  Future<void> deleteVlog(String id) async {
    final repo = ref.read(vlogsRepositoryProvider);
    await repo.deleteVlog(id);
    state = state.copyWith(vlogs: [for (final v in state.vlogs) if (v.id != id) v]);
  }

  Future<void> savePillar(Pillar pillar) async {
    final repo = ref.read(pillarsRepositoryProvider);
    await repo.insertPillar(pillar);
    state = state.copyWith(pillars: [pillar, ...state.pillars]);
  }

  Future<void> saveAdviceCard(AdviceCard card) async {
    final repo = ref.read(pillarsRepositoryProvider);
    await repo.insertAdviceCard(card);
    state = state.copyWith(adviceCards: [card, ...state.adviceCards]);
  }

  /// Persists and applies a preference change (settings table is the source of truth).
  Future<void> setPreference({
    int? fontIndex,
    int? sizeIndex,
    bool? enableHaptics,
    bool? useBiometrics,
    int? lockTimeoutMins,
    String? vlogQuality,
    String? compressionPreset,
    bool? devMode,
    bool? preferPinAuth,
    bool? logMode,
    bool? autoGenerateSummaries,
  }) async {
    final service = ref.read(settingsServiceProvider);
    final prefs = state.preferences;
    final next = prefs.copyWith(
      fontIndex: fontIndex,
      sizeIndex: sizeIndex,
      enableHaptics: enableHaptics,
      useBiometrics: useBiometrics,
      lockTimeoutMins: lockTimeoutMins,
      vlogQuality: vlogQuality,
      compressionPreset: compressionPreset,
      devMode: devMode,
      preferPinAuth: preferPinAuth,
      logMode: logMode,
      autoGenerateSummaries: autoGenerateSummaries,
    );

    final writes = <Future<void>>[];
    if (fontIndex != null) writes.add(service.setRaw(SettingsKeys.userFontIdx, '$fontIndex'));
    if (sizeIndex != null) writes.add(service.setRaw(SettingsKeys.userSizeIdx, '$sizeIndex'));
    if (enableHaptics != null) {
      writes.add(service.setRaw(SettingsKeys.enableHaptics, '$enableHaptics'));
      setGlobalHapticsEnabled(enableHaptics);
    }
    if (useBiometrics != null) {
      writes.add(service.setRaw(SettingsKeys.useBiometrics, '$useBiometrics'));
    }
    if (lockTimeoutMins != null) {
      writes.add(service.setRaw(SettingsKeys.lockTimeoutMins, '$lockTimeoutMins'));
    }
    if (vlogQuality != null) writes.add(service.setRaw(SettingsKeys.vlogQuality, vlogQuality));
    if (compressionPreset != null) {
      writes.add(service.setRaw(SettingsKeys.compressionPreset, compressionPreset));
    }
    if (devMode != null) writes.add(service.setRaw(SettingsKeys.devMode, '$devMode'));
    if (preferPinAuth != null) {
      writes.add(service.setRaw(SettingsKeys.preferPinAuth, '$preferPinAuth'));
    }
    if (logMode != null) {
      writes.add(service.setRaw(SettingsKeys.logMode, '$logMode'));
      setLogMode(logMode);
    }
    if (autoGenerateSummaries != null) {
      writes.add(service.setRaw(SettingsKeys.autoGenerateSummaries, '$autoGenerateSummaries'));
    }
    await Future.wait(writes);
    state = state.copyWith(preferences: next);
  }
}
