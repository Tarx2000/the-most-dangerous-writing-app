/// Central app configuration — every tunable value lives here.
/// Values mirror `SPEC_1TO1.md` §2 (extracted from the RN app's `src/config/index.ts`).
library;

/// App version, kept in sync with the RN app (v1.5.8).
const String appVersion = '1.5.8';

/// Difficulty idle limits: how long you may stop typing before your text dies.
/// Index matches the difficulty pills (EASY / MID / HARD).
const List<int> difficultyLimitsMs = [12000, 8000, 5000];

/// Default difficulty index (MID = 8 s).
const int defaultDifficultyIndex = 1;

/// Idle timer tick rate (10 Hz — updates a plain int/ValueNotifier, no rebuilds).
const int tickRateMs = 100;

/// Idle ratio at which the text starts to vaporize (not used by the engine,
/// kept for parity with the RN constants).
const double blurRatioStart = 0.5;

/// Session durations for journal/circles writing.
const List<int> sessionOptionsMins = [3, 5, 10, 15, 30, 60];

/// Default session index (5 min).
const int defaultSessionIndex = 1;

/// Session durations for vlog recording.
const List<int> vlogSessionOptionsMins = [1, 2, 3, 5, 10, 15];

/// Vlog recording quality options (as surfaced in settings).
const List<String> vlogQualityOptions = ['720p', '1080p', '2160p'];

/// Default vlog quality.
const String defaultVlogQuality = '1080p';

/// Recording bitrate per quality (bps).
const Map<String, int> vlogBitrateMap = {'720p': 2500000, '1080p': 4500000, '2160p': 12000000};

/// Vlog storage directory (relative to the app documents directory).
const String vlogStorageDir = 'vlogs/';

/// Vlog thumbnail directory.
const String vlogThumbnailsDir = 'vlog_thumbnails/';

/// Compression presets (id → max resolution + bitrate in bps).
/// `off` disables compression entirely.
class CompressionPreset {
  const CompressionPreset({required this.id, required this.maxSize, required this.bitrate});

  final String id;
  final int maxSize;
  final int bitrate;
}

const List<CompressionPreset> vlogCompressionPresets = [
  CompressionPreset(id: 'off', maxSize: 0, bitrate: 0),
  CompressionPreset(id: 'light', maxSize: 1920, bitrate: 4000000),
  CompressionPreset(id: 'balanced', maxSize: 1080, bitrate: 2500000),
  CompressionPreset(id: 'max', maxSize: 720, bitrate: 1200000),
];

/// Default compression preset.
const String defaultCompressionPreset = 'balanced';

/// PIN security.
const int pinMaxAttempts = 3;
const int pinLockoutDurationMs = 30000;
const int pinDotDelayMs = 150;

/// Check-in urgency: gold dot on the nav tab after this many days without a check-in.
const int checkinUrgentDays = 7;

/// Delay before the 4th PIN digit is accepted (lets the fill animation play).

/// Camera permission grace delay + countdown interval.
const int permissionGrantedDelayMs = 500;
const int countdownIntervalMs = 1000;

/// Long-press duration on the settings cog to enter dev mode.
const int devModeLongPressMs = 4000;

/// Dev-mode toast duration.
const int devModeToastMs = 2000;

/// Tweet threshold: at or below this many words an entry is a "tweet".
const int tweetThreshold = 45;

/// Minimum word count for AI title/summary processing.
const int minAiWords = 45;

/// Fonts (user-selectable). Indices match the old app's list order.
const List<String> fontAssetPaths = [
  '', // 0 System (no asset)
  '', // 1 Serif (Georgia/serif on iOS, serif on Android)
  '', // 2 Casual (Chalkboard SE / casual)
  'assets/fonts/PlayfairDisplay_400Regular.ttf',
  'assets/fonts/SpaceMono_400Regular.ttf',
  'assets/fonts/Caveat_400Regular.ttf',
  'assets/fonts/Lora_400Regular.ttf',
  'assets/fonts/ZillaSlab_400Regular.ttf',
  'assets/fonts/CrimsonPro_400Regular.ttf',
  'assets/fonts/DMSans_400Regular.ttf',
  'assets/fonts/EagleLake_400Regular.ttf',
];

/// Reading-size presets (fontSize, lineHeight).
class ReadingSize {
  const ReadingSize(this.fontSize, this.lineHeight);

  final double fontSize;
  final double lineHeight;
}

const List<ReadingSize> readingSizes = [
  ReadingSize(14, 22), // Small
  ReadingSize(18, 28), // Normal (default)
  ReadingSize(24, 36), // Large
  ReadingSize(32, 48), // Giant
];

/// Default reading size index.
const int defaultSizeIndex = 1;
