/// In-memory application state — the single source of truth for all domains.
/// Mirrors the RN app's StorageProvider split-contexts (notes, persons, streaks,
/// preferences, feed, vlogs, pillars) in one immutable snapshot.
library;

import 'models/person.dart';
import 'models/pillar.dart';
import 'models/saved_note.dart';
import 'models/saved_vlog.dart';

class PreferencesState {
  const PreferencesState({
    this.fontIndex = 0,
    this.sizeIndex = 1,
    this.useBiometrics = true,
    this.enableHaptics = true,
    this.lockTimeoutMins = 3,
    this.vlogQuality = '1080p',
    this.compressionPreset = 'balanced',
    this.devMode = false,
    this.debugLayout = false,
    this.visionBoard,
    this.preferPinAuth = false,
    this.logMode = false,
    this.lastReflectionDate,
    this.autoGenerateSummaries = true,
  });

  final int fontIndex;
  final int sizeIndex;
  final bool useBiometrics;
  final bool enableHaptics;
  final int lockTimeoutMins;
  final String vlogQuality;
  final String compressionPreset;
  final bool devMode;
  final bool debugLayout;
  final Map<String, String>? visionBoard;
  final bool preferPinAuth;
  final bool logMode;
  final int? lastReflectionDate; // ms
  final bool autoGenerateSummaries;

  PreferencesState copyWith({
    int? fontIndex,
    int? sizeIndex,
    bool? useBiometrics,
    bool? enableHaptics,
    int? lockTimeoutMins,
    String? vlogQuality,
    String? compressionPreset,
    bool? devMode,
    bool? debugLayout,
    Map<String, String>? visionBoard,
    bool? preferPinAuth,
    bool? logMode,
    int? lastReflectionDate,
    bool? autoGenerateSummaries,
  }) {
    return PreferencesState(
      fontIndex: fontIndex ?? this.fontIndex,
      sizeIndex: sizeIndex ?? this.sizeIndex,
      useBiometrics: useBiometrics ?? this.useBiometrics,
      enableHaptics: enableHaptics ?? this.enableHaptics,
      lockTimeoutMins: lockTimeoutMins ?? this.lockTimeoutMins,
      vlogQuality: vlogQuality ?? this.vlogQuality,
      compressionPreset: compressionPreset ?? this.compressionPreset,
      devMode: devMode ?? this.devMode,
      debugLayout: debugLayout ?? this.debugLayout,
      visionBoard: visionBoard ?? this.visionBoard,
      preferPinAuth: preferPinAuth ?? this.preferPinAuth,
      logMode: logMode ?? this.logMode,
      lastReflectionDate: lastReflectionDate ?? this.lastReflectionDate,
      autoGenerateSummaries: autoGenerateSummaries ?? this.autoGenerateSummaries,
    );
  }
}

class StreakState {
  const StreakState({this.currentStreak = 0, this.lastWinDate = '', this.streakHistory = const []});

  final int currentStreak;
  final String lastWinDate; // YYYY-MM-DD
  final List<String> streakHistory;

  StreakState copyWith({int? currentStreak, String? lastWinDate, List<String>? streakHistory}) {
    return StreakState(
      currentStreak: currentStreak ?? this.currentStreak,
      lastWinDate: lastWinDate ?? this.lastWinDate,
      streakHistory: streakHistory ?? this.streakHistory,
    );
  }
}

class FeedState {
  const FeedState({
    this.bookmarkedNoteIds = const [],
    this.feedComments = const {},
    this.autoPlayFeedVideos = true,
  });

  final List<String> bookmarkedNoteIds;
  final Map<String, String> feedComments;
  final bool autoPlayFeedVideos;

  FeedState copyWith({
    List<String>? bookmarkedNoteIds,
    Map<String, String>? feedComments,
    bool? autoPlayFeedVideos,
  }) {
    return FeedState(
      bookmarkedNoteIds: bookmarkedNoteIds ?? this.bookmarkedNoteIds,
      feedComments: feedComments ?? this.feedComments,
      autoPlayFeedVideos: autoPlayFeedVideos ?? this.autoPlayFeedVideos,
    );
  }
}

/// Immutable snapshot of the whole app state (fresh-read source for actions).
class AppData {
  const AppData({
    this.notes = const [],
    this.persons = const [],
    this.vlogs = const [],
    this.pillars = const [],
    this.adviceCards = const [],
    this.lastLogDate,
    this.preferences = const PreferencesState(),
    this.streak = const StreakState(),
    this.feed = const FeedState(),
    this.isLoaded = false,
  });

  final List<SavedNote> notes;
  final List<Person> persons;
  final List<SavedVlog> vlogs;
  final List<Pillar> pillars;
  final List<AdviceCard> adviceCards;
  final int? lastLogDate; // ms of most recent check-in
  final PreferencesState preferences;
  final StreakState streak;
  final FeedState feed;

  /// True after the crash-proof startup load completed (best-effort).
  final bool isLoaded;

  AppData copyWith({
    List<SavedNote>? notes,
    List<Person>? persons,
    List<SavedVlog>? vlogs,
    List<Pillar>? pillars,
    List<AdviceCard>? adviceCards,
    int? lastLogDate,
    PreferencesState? preferences,
    StreakState? streak,
    FeedState? feed,
    bool? isLoaded,
  }) {
    return AppData(
      notes: notes ?? this.notes,
      persons: persons ?? this.persons,
      vlogs: vlogs ?? this.vlogs,
      pillars: pillars ?? this.pillars,
      adviceCards: adviceCards ?? this.adviceCards,
      lastLogDate: lastLogDate ?? this.lastLogDate,
      preferences: preferences ?? this.preferences,
      streak: streak ?? this.streak,
      feed: feed ?? this.feed,
      isLoaded: isLoaded ?? this.isLoaded,
    );
  }
}
