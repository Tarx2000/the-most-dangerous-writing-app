/// Settings service — typed access to the settings table (SPEC §7).
/// Every preference key is defined here with its default; values are JSON
/// strings in the DB exactly like the RN app.
library;

import 'dart:convert';

import '../database/repositories/settings_repository.dart';

/// All preference keys (mirror of the RN settings-table registry, SPEC §7).
abstract final class SettingsKeys {
  static const userFontIdx = 'USER_FONT_IDX';
  static const userSizeIdx = 'USER_SIZE_IDX';
  static const useBiometrics = 'USE_BIOMETRICS';
  static const enableHaptics = 'ENABLE_HAPTICS';
  static const lockTimeoutMins = 'LOCK_TIMEOUT_MINS';
  static const vlogQuality = 'VLOG_QUALITY';
  static const compressionPreset = 'COMPRESSION_PRESET';
  static const devMode = 'DEV_MODE';
  static const debugLayout = 'DEBUG_LAYOUT';
  static const visionBoard = 'VISION_BOARD';
  static const preferPinAuth = 'PREFER_PIN_AUTH';
  static const logMode = 'LOG_MODE';
  static const currentStreak = 'CURRENT_STREAK';
  static const lastWinDate = 'LAST_WIN_DATE';
  static const streakHistory = 'STREAK_HISTORY';
  static const lastReflectionDate = 'LAST_REFLECTION_DATE';
  static const bookmarkedNoteIds = 'BOOKMARKED_NOTE_IDS';
  static const feedComments = 'FEED_COMMENTS';
  static const autoPlayFeedVideos = 'AUTO_PLAY_FEED_VIDEOS';
  static const autoGenerateSummaries = 'AUTO_GENERATE_SUMMARIES';
  static const aiProvider = 'AI_PROVIDER';
  static const aiOllamaApiKey = 'AI_OLLAMA_API_KEY';
  static const aiOllamaBaseUrl = 'AI_OLLAMA_BASE_URL';
  static const aiOllamaModel = 'AI_OLLAMA_MODEL';
  static const aiOllamaGrammarModel = 'AI_OLLAMA_GRAMMAR_MODEL';
  static const aiNeuralwattApiKey = 'AI_NEURALWATT_API_KEY';
  static const aiNeuralwattBaseUrl = 'AI_NEURALWATT_BASE_URL';
  static const aiNeuralwattModel = 'AI_NEURALWATT_MODEL';
  static const aiNeuralwattGrammarModel = 'AI_NEURALWATT_GRAMMAR_MODEL';
  static const aiCustomPrompts = 'AI_CUSTOM_PROMPTS';
  static const aiFavoriteModels = 'AI_FAVORITE_MODELS';

  /// API-key settings that must be stripped from backups (SPEC §13).
  static const backupSecretKeys = {aiOllamaApiKey, aiNeuralwattApiKey};
}

class SettingsService {
  SettingsService(this._repository);

  final SettingsRepository _repository;

  Future<String?> raw(String key) => _repository.getSetting(key);

  Future<void> setRaw(String key, String value) => _repository.setSetting(key, value);

  // -- Typed helpers -------------------------------------------------------

  Future<int> getInt(String key, int fallback) async {
    final raw = await _repository.getSetting(key);
    return int.tryParse(raw ?? '') ?? fallback;
  }

  Future<bool> getBool(String key, bool fallback) async {
    final raw = await _repository.getSetting(key);
    if (raw == null) return fallback;
    return raw == 'true' || raw == '1';
  }

  Future<String> getString(String key, String fallback) async {
    final raw = await _repository.getSetting(key);
    return (raw == null || raw.isEmpty) ? fallback : raw;
  }

  Future<List<dynamic>> getJsonList(String key, List<dynamic> fallback) async {
    final raw = await _repository.getSetting(key);
    if (raw == null || raw.isEmpty) return fallback;
    try {
      final decoded = jsonDecode(raw);
      return decoded is List ? decoded : fallback;
    } catch (_) {
      return fallback;
    }
  }

  Future<Map<String, dynamic>> getJsonMap(String key, Map<String, dynamic> fallback) async {
    final raw = await _repository.getSetting(key);
    if (raw == null || raw.isEmpty) return fallback;
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map<String, dynamic> ? decoded : fallback;
    } catch (_) {
      return fallback;
    }
  }

  /// All settings as a raw key/value map (used by backup export).
  Future<Map<String, String>> getAll() => _repository.getAllSettings();

  Future<void> delete(String key) => _repository.deleteSetting(key);
}
