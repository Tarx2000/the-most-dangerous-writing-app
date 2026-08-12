/// Riverpod wiring — repository/services providers + the StorageNotifier.
/// Mirrors the RN split-context pattern: one store, granular derived providers
/// so widgets re-render only on their domain.
library;

import 'dart:async';
import 'dart:convert' show jsonEncode;
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config/app_config.dart' show tweetThreshold;
import '../core/haptics.dart';
import '../core/logger.dart';
import '../core/utils.dart';
import '../domain/use_cases/mastery_logic.dart';
import '../domain/use_cases/streak_calculator.dart';
import 'ai_providers.dart';
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
import 'queues/compression_queue.dart';
import 'services/backup_service.dart';
import 'services/secure_storage_service.dart';
import 'services/settings_service.dart';
import 'services/thumbnail_service.dart';
import 'services/vlog_compressor.dart';
import 'services/vlog_storage_manager.dart';

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

final thumbnailServiceProvider = Provider<ThumbnailService>((ref) => ThumbnailService());

final vlogStorageManagerProvider = Provider<VlogStorageManager>((ref) => VlogStorageManager());

final backupServiceProvider = Provider<BackupService>(
  (ref) => BackupService(settings: ref.watch(settingsServiceProvider)),
);

final vlogCompressorProvider = Provider<VlogCompressor>((ref) => VlogCompressor());

/// Singleton compression queue (mirror of the AI queue pattern).
final compressionQueueManagerProvider = Provider<CompressionQueueManager>((ref) {
  final manager = CompressionQueueManager(
    compressor: ref.watch(vlogCompressorProvider),
    deps: CompressionDeps(
      updateVlog: (vlogId, updates) =>
          ref.read(vlogsRepositoryProvider).updateVlog(vlogId, updates),
      deleteVlogFile: (path) async {
        final file = File(path);
        if (await file.exists()) await file.delete();
      },
    ),
  );
  return manager;
});

/// Live compression queue state.
final compressionQueueStateProvider = StreamProvider<CompressionQueueState>((ref) {
  final manager = ref.watch(compressionQueueManagerProvider);
  final controller = StreamController<CompressionQueueState>.broadcast();
  void emit() {
    if (!controller.isClosed) controller.add(manager.state.value);
  }

  emit();
  manager.state.addListener(emit);
  ref.onDispose(() {
    manager.state.removeListener(emit);
    controller.close();
  });
  return controller.stream;
});

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

/// Streak popup event (set by saveEntry; the StartScreen renders it once and
/// dismisses). Mirrors the RN `DeviceEventEmitter` 'streakIncreased' channel.
class StreakPopupData {
  const StreakPopupData({required this.streak, required this.history});

  final int streak;
  final List<String> history;
}

final pendingStreakPopupProvider =
    StateProvider<StreakPopupData?>((ref) => null);

/// Result of saving an entry (streak side-effects, parity with RN saveNote).
class SaveEntryResult {
  const SaveEntryResult({
    required this.note,
    required this.streakIncreased,
    required this.newStreak,
  });

  final SavedNote note;
  final bool streakIncreased;
  final int newStreak;
}

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
      _loadStreak(),
    ]);

    final notes = results[0] as List<SavedNote>;
    final persons = results[1] as List<Person>;
    final prefs = results[2] as PreferencesState;
    final streak = results[3] as StreakState;

    // Sync global runtime flags from the loaded preferences.
    setGlobalHapticsEnabled(prefs.enableHaptics);
    setLogMode(prefs.logMode);

    state = state.copyWith(
      notes: notes,
      persons: persons,
      preferences: prefs,
      streak: streak,
      isLoaded: true,
    );

    // Phase 2 — deferred domains (never block the first frame).
    final deferred = await Future.wait([
      _loadVlogs(),
      _loadPillars(),
      _loadFeed(),
    ]);

    // AI config + queue boot (loads persisted jobs, recovers orphans).
    // Awaited so the boot is deterministic (no dangling futures that could
    // outlive the DB handle); failure is guarded inside load().
    await ref.read(aiConfigProvider.notifier).load();

    // Compression queue boot (mirror pattern, crash-proof).
    try {
      await ref.read(compressionQueueManagerProvider).initialize();
    } catch (e) {
      logCompressor.warn('compression queue boot failed (continuing)', e);
    }

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

  /// Loads the persisted streak state (CURRENT_STREAK / LAST_WIN_DATE /
  /// STREAK_HISTORY) — runs as part of the critical boot phase.
  Future<StreakState> _loadStreak() async {
    final service = ref.read(settingsServiceProvider);
    try {
      return StreakState(
        currentStreak: await service.getInt(SettingsKeys.currentStreak, 0),
        lastWinDate: await service.getString(SettingsKeys.lastWinDate, ''),
        streakHistory: (await service.getJsonList(SettingsKeys.streakHistory, []))
            .whereType<String>()
            .toList(),
      );
    } catch (e) {
      logStorage.error('streak load failed', e);
      return const StreakState();
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

  /// Saves a completed writing entry and applies the streak rules (SPEC §8).
  ///
  /// Commit semantics (parity with RN saveNote): the note INSERT is the source
  /// of truth — on failure everything rolls back (with error haptic); on
  /// success streak settings are best-effort secondary writes that never roll
  /// back the note. Tweet auto-classification: `wordCount <= 45` forces isTweet.
  Future<SaveEntryResult> saveEntry({
    required String text,
    required bool won,
    required int durationMin,
    String? personId,
    bool isQuickNote = false,
    bool isTweet = false,
  }) async {
    final notesRepo = ref.read(notesRepositoryProvider);
    final settings = ref.read(settingsServiceProvider);
    final prevStreak = state.streak;

    final classifiedTweet = isTweet || countWords(text) <= tweetThreshold;
    final todayStr = toLocalDateString(DateTime.now());
    final note = SavedNote(
      id: generateId(),
      text: text,
      dateStr: todayStr,
      timestamp: DateTime.now().millisecondsSinceEpoch,
      durationMin: durationMin,
      won: won,
      personId: personId,
      isQuickNote: isQuickNote,
      isTweet: classifiedTweet,
    );

    final eligible = isStreakEligible(
      won: won,
      durationMin: durationMin,
      isQuickNote: isQuickNote,
      isTweet: classifiedTweet,
    );
    final result = applyNoteToStreak(
      won: won,
      durationMin: durationMin,
      isQuickNote: isQuickNote,
      isTweet: classifiedTweet,
      currentStreak: prevStreak.currentStreak,
      lastWinDate: prevStreak.lastWinDate,
      streakHistory: prevStreak.streakHistory,
      now: DateTime.now(),
    );
    final newLastWinDate =
        eligible && prevStreak.lastWinDate != todayStr ? todayStr : prevStreak.lastWinDate;

    // Optimistic UI update.
    state = state.copyWith(
      notes: [note, ...state.notes],
      streak: StreakState(
        currentStreak: result.streak,
        lastWinDate: newLastWinDate,
        streakHistory: result.history,
      ),
    );

    // Note insert is the single source of truth — full rollback on failure.
    try {
      await notesRepo.insertNote(note);
    } catch (e) {
      vibrate([0, 500]);
      logStorage.error('saveEntry failed, rolling back', e);
      state = state.copyWith(
        notes: prevStreak == state.streak ? state.notes : state.notes.where((n) => n.id != note.id).toList(),
        streak: prevStreak,
      );
      // Re-read authoritative state: simplest correct rollback is a reload.
      state = state.copyWith(
        notes: await notesRepo.getAllNotes(),
        streak: prevStreak,
      );
      return SaveEntryResult(note: note, streakIncreased: false, newStreak: prevStreak.currentStreak);
    }

    // Note committed. Streak settings are best-effort secondary writes.
    if (eligible) {
      try {
        await settings.setRaw(SettingsKeys.currentStreak, '${result.streak}');
        await settings.setRaw(SettingsKeys.lastWinDate, newLastWinDate);
        await settings.setRaw(SettingsKeys.streakHistory, jsonEncode(result.history));
      } catch (e) {
        logStorage.warn('streak settings write failed (note still saved)', e);
      }
    }

    if (result.streakIncreased) {
      ref.read(pendingStreakPopupProvider.notifier).state = StreakPopupData(
        streak: result.streak,
        history: result.history,
      );
    }

    return SaveEntryResult(
      note: note,
      streakIncreased: result.streakIncreased,
      newStreak: result.streak,
    );
  }

  /// Dismisses the pending streak popup (called by the popup's close button).
  void dismissStreakPopup() {
    ref.read(pendingStreakPopupProvider.notifier).state = null;
  }

  // -- Backup (SPEC §13) -------------------------------------------------------

  /// Exports a backup ZIP for the given scopes; returns the result.
  Future<BackupResult> exportBackupZip(
    List<String> scopes, {
    void Function(double progress)? onProgress,
  }) {
    return ref.read(backupServiceProvider).exportBackupZip(
          scopes: scopes,
          onProgress: onProgress,
        );
  }

  /// Imports a backup ZIP (gates + rollback inside the service).
  Future<BackupResult> importBackupZip(
    String zipPath, {
    void Function(double progress)? onProgress,
  }) async {
    // Pause both queues for the restore (SPEC §13), reload after success.
    final aiQueue = ref.read(aiQueueManagerProvider);
    final compressionQueue = ref.read(compressionQueueManagerProvider);
    aiQueue.pause();
    compressionQueue.pause();
    try {
      final result = await ref.read(backupServiceProvider).importBackupZip(
            zipPath: zipPath,
            onProgress: onProgress,
          );
      if (result.success) {
        await loadAll();
      }
      return result;
    } finally {
      aiQueue.resume();
      compressionQueue.resume();
    }
  }

  // -- Feed actions (SPEC §14: bookmarks + comments in the settings table) ----

  Future<void> toggleBookmark(String noteId) async {
    final settings = ref.read(settingsServiceProvider);
    final bookmarks = [...state.feed.bookmarkedNoteIds];
    final isBookmarked = bookmarks.contains(noteId);
    if (isBookmarked) {
      bookmarks.remove(noteId);
    } else {
      bookmarks.add(noteId);
    }
    await settings.setRaw(SettingsKeys.bookmarkedNoteIds, jsonEncode(bookmarks));
    state = state.copyWith(
      feed: state.feed.copyWith(bookmarkedNoteIds: bookmarks),
    );
  }

  Future<void> saveFeedComment(String noteId, String comment) async {
    final settings = ref.read(settingsServiceProvider);
    final comments = {...state.feed.feedComments};
    if (comment.trim().isEmpty) {
      comments.remove(noteId);
    } else {
      comments[noteId] = comment.trim().substring(0, comment.trim().length.clamp(0, 500));
    }
    await settings.setRaw(SettingsKeys.feedComments, jsonEncode(comments));
    state = state.copyWith(
      feed: state.feed.copyWith(feedComments: comments),
    );
  }

  Future<void> toggleAutoPlayFeedVideos(bool enabled) async {
    final settings = ref.read(settingsServiceProvider);
    await settings.setRaw(SettingsKeys.autoPlayFeedVideos, '$enabled');
    state = state.copyWith(
      feed: state.feed.copyWith(autoPlayFeedVideos: enabled),
    );
  }

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

  /// Saves a mastery (SPEC §10): new pillars get version 1 + an initial
  /// version row; edits bump the version ONLY when title/description changed.
  Future<void> upsertPillar(Pillar pillar) async {
    final repo = ref.read(pillarsRepositoryProvider);
    final existing = state.pillars.where((p) => p.id == pillar.id).firstOrNull;
    final now = DateTime.now().millisecondsSinceEpoch;

    if (existing == null) {
      await repo.insertPillar(pillar);
      await repo.insertPillarVersion(PillarVersion(
        id: '${pillar.id}_v1',
        pillarId: pillar.id,
        version: 1,
        title: pillar.title,
        description: pillar.description,
        createdAt: now,
      ));
      state = state.copyWith(pillars: [pillar, ...state.pillars]);
      return;
    }

    final contentChanged =
        existing.title != pillar.title || existing.description != pillar.description;
    final updated = contentChanged
        ? pillar.copyWith(version: existing.version + 1, lastEditedAt: now)
        : pillar.copyWith(lastEditedAt: now);

    await repo.updatePillar(updated.id, {
      'title': updated.title,
      'description': updated.description,
      'type': updated.type.name,
      'scope': updated.scope.name,
      'adaptive_days': updated.adaptiveDays,
      'is_active': updated.isActive ? 1 : 0,
      'last_edited_at': updated.lastEditedAt,
      'version': updated.version,
    });
    if (contentChanged) {
      await repo.insertPillarVersion(PillarVersion(
        id: '${updated.id}_v${updated.version}',
        pillarId: updated.id,
        version: updated.version,
        title: updated.title,
        description: updated.description,
        createdAt: now,
      ));
    }
    state = state.copyWith(
      pillars: [
        for (final p in state.pillars)
          if (p.id == updated.id) updated else p,
      ],
    );
  }

  /// Hard delete (cascade: pillar + logs + versions).
  Future<void> deletePillar(String id) async {
    final repo = ref.read(pillarsRepositoryProvider);
    await repo.hardDeletePillar(id);
    state = state.copyWith(pillars: [for (final p in state.pillars) if (p.id != id) p]);
  }

  Future<void> togglePillarActive(String id) async {
    final repo = ref.read(pillarsRepositoryProvider);
    final pillar = state.pillars.where((p) => p.id == id).firstOrNull;
    if (pillar == null) return;
    final next = !pillar.isActive;
    await repo.updatePillar(id, {'is_active': next ? 1 : 0});
    state = state.copyWith(
      pillars: [
        for (final p in state.pillars) if (p.id == id) p.copyWith(isActive: next) else p,
      ],
    );
  }

  Future<void> saveAdviceCard(AdviceCard card) async {
    final repo = ref.read(pillarsRepositoryProvider);
    await repo.insertAdviceCard(card);
    state = state.copyWith(adviceCards: [card, ...state.adviceCards]);
  }

  Future<void> deleteAdviceCard(String id) async {
    final repo = ref.read(pillarsRepositoryProvider);
    await repo.deactivateAdviceCard(id);
    state = state.copyWith(adviceCards: [for (final c in state.adviceCards) if (c.id != id) c]);
  }

  Future<List<PillarLog>> getPillarLogs(String pillarId) async {
    final repo = ref.read(pillarsRepositoryProvider);
    return repo.getPillarLogs(pillarId);
  }

  /// Saves a check-in log and tracks the 3-hour rate limit (SPEC §10).
  Future<void> savePillarLog(PillarLog log) async {
    final repo = ref.read(pillarsRepositoryProvider);
    await repo.insertPillarLog(log);
    state = state.copyWith(
      lastLogDate: DateTime.now().millisecondsSinceEpoch,
    );
  }

  Future<void> linkPillarLogNote(String logId, String noteId) async {
    final repo = ref.read(pillarsRepositoryProvider);
    await repo.updatePillarLogNoteId(logId, noteId);
  }

  Future<void> incrementAdviceReflection(String adviceId) async {
    final repo = ref.read(pillarsRepositoryProvider);
    await repo.incrementAdviceReflection(adviceId, DateTime.now().millisecondsSinceEpoch);
  }

  Future<PillarVersion?> getPillarVersion(String pillarId, int version) async {
    final repo = ref.read(pillarsRepositoryProvider);
    return repo.getPillarVersion(pillarId, version);
  }

  /// Weighted random advice card (SPEC §10).
  AdviceCard? getSmartAdvice() {
    return pickSmartAdvice(cards: state.adviceCards);
  }

  /// Check-in pillar pick (SPEC §10): 2 daily / 3 weekly + shuffle.
  List<Pillar> getPillarsForCheckIn(bool isWeekly) {
    return pickPillarsForCheckIn(allPillars: state.pillars, isWeekly: isWeekly);
  }

  /// True when the check-in rate limit (3 h) has not elapsed since the last log.
  bool isCheckinRateLimited({DateTime? now}) {
    final last = state.lastLogDate;
    if (last == null) return false;
    return (now ?? DateTime.now()).millisecondsSinceEpoch - last < checkinRateLimitMs;
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
