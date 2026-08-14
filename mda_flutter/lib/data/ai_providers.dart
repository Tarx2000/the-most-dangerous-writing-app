/// AI configuration state + queue wiring (Riverpod).
/// The config loads from the settings table (SPEC §7 AI keys) and feeds the
/// singleton [AiQueueManager].
library;

import 'dart:async';
import 'dart:convert' show jsonEncode;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/logger.dart';
import 'providers.dart';
import 'queues/ai_queue.dart';
import 'services/ai_config.dart';
import 'services/ai_logger.dart';
import 'services/ai_service.dart';
import 'services/settings_service.dart';

/// The full user-facing AI configuration state.
class AiConfigState {
  const AiConfigState({
    this.provider = AiProvider.ollama,
    this.ollamaApiKey = AiDefaults.ollamaApiKey,
    this.ollamaBaseUrl = AiDefaults.ollamaBaseUrl,
    this.ollamaModel = AiDefaults.ollamaModel,
    this.ollamaGrammarModel = '',
    this.neuralwattApiKey = '',
    this.neuralwattBaseUrl = AiDefaults.neuralwattBaseUrl,
    this.neuralwattModel = AiDefaults.neuralwattModel,
    this.neuralwattGrammarModel = '',
    this.customPrompts = const {},
    this.favoriteModels = const [],
    this.autoGenerateSummaries = true,
  });

  final String provider;
  final String ollamaApiKey;
  final String ollamaBaseUrl;
  final String ollamaModel;
  final String ollamaGrammarModel;
  final String neuralwattApiKey;
  final String neuralwattBaseUrl;
  final String neuralwattModel;
  final String neuralwattGrammarModel;
  final Map<String, String> customPrompts;
  final List<String> favoriteModels;
  final bool autoGenerateSummaries;

  String get apiKey => provider == AiProvider.neuralwatt ? neuralwattApiKey : ollamaApiKey;
  String get baseUrl => provider == AiProvider.neuralwatt ? neuralwattBaseUrl : ollamaBaseUrl;
  String get model => provider == AiProvider.neuralwatt ? neuralwattModel : ollamaModel;
  String get grammarModel =>
      provider == AiProvider.neuralwatt ? neuralwattGrammarModel : ollamaGrammarModel;

  /// Resolves to the runtime config used by the queue/service.
  AiConfig toRuntimeConfig() {
    return AiConfig(
      provider: provider,
      apiKey: apiKey,
      baseUrl: baseUrl,
      model: model,
      grammarModel: grammarModel,
      prompts: customPrompts,
    );
  }

  AiConfigState copyWith({
    String? provider,
    String? ollamaApiKey,
    String? ollamaBaseUrl,
    String? ollamaModel,
    String? ollamaGrammarModel,
    String? neuralwattApiKey,
    String? neuralwattBaseUrl,
    String? neuralwattModel,
    String? neuralwattGrammarModel,
    Map<String, String>? customPrompts,
    List<String>? favoriteModels,
    bool? autoGenerateSummaries,
  }) {
    return AiConfigState(
      provider: provider ?? this.provider,
      ollamaApiKey: ollamaApiKey ?? this.ollamaApiKey,
      ollamaBaseUrl: ollamaBaseUrl ?? this.ollamaBaseUrl,
      ollamaModel: ollamaModel ?? this.ollamaModel,
      ollamaGrammarModel: ollamaGrammarModel ?? this.ollamaGrammarModel,
      neuralwattApiKey: neuralwattApiKey ?? this.neuralwattApiKey,
      neuralwattBaseUrl: neuralwattBaseUrl ?? this.neuralwattBaseUrl,
      neuralwattModel: neuralwattModel ?? this.neuralwattModel,
      neuralwattGrammarModel: neuralwattGrammarModel ?? this.neuralwattGrammarModel,
      customPrompts: customPrompts ?? this.customPrompts,
      favoriteModels: favoriteModels ?? this.favoriteModels,
      autoGenerateSummaries: autoGenerateSummaries ?? this.autoGenerateSummaries,
    );
  }
}

// -- Providers ----------------------------------------------------------------------

final aiConfigProvider = NotifierProvider<AiConfigNotifier, AiConfigState>(AiConfigNotifier.new);

final aiLoggerProvider = Provider<AiLogger>((ref) => AiLogger());

final aiServiceProvider = Provider<AiService>((ref) => AiService());

/// Singleton queue manager (one per app run — parity with the RN singleton).
final aiQueueManagerProvider = Provider<AiQueueManager>((ref) {
  final manager = AiQueueManager(
    service: ref.watch(aiServiceProvider),
    logger: ref.watch(aiLoggerProvider),
    deps: AiQueueDeps(
      loadNotes: () => ref.read(notesRepositoryProvider).getAllNotes(),
      getNote: (id) => ref.read(notesRepositoryProvider).getNoteById(id),
      updateNote: (id, updates) => ref.read(appDataProvider.notifier).updateNote(id, updates),
      getPersonName: (personId) async {
        final person = await ref.read(personsRepositoryProvider).getPersonById(personId);
        if (person == null) return null;
        return RelationshipContext(
          personName: person.displayName,
          relationshipStatus: person.relationship ?? 'an unknown person',
        );
      },
    ),
  );
  return manager;
});

/// Live queue state (bridged from the manager's ValueNotifier).
final aiQueueStateProvider = StreamProvider<AiQueueState>((ref) {
  final manager = ref.watch(aiQueueManagerProvider);
  final controller = StreamController<AiQueueState>.broadcast();
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

/// Failure notifications (last 5).
final aiFailureNotificationsProvider = Provider<List<AiFailureNotification>>((ref) {
  ref.watch(aiQueueStateProvider);
  return ref.watch(aiQueueManagerProvider).notifications;
});

// -- AiConfigNotifier ---------------------------------------------------------------

class AiConfigNotifier extends Notifier<AiConfigState> {
  @override
  AiConfigState build() => const AiConfigState();

  /// Loads the persisted AI settings (SPEC §7 keys).
  /// Fully guarded: AI boot must never break app startup.
  Future<void> load() async {
    try {
      final service = ref.read(settingsServiceProvider);
      final state = AiConfigState(
        provider: await service.getString(SettingsKeys.aiProvider, AiProvider.ollama),
        ollamaApiKey:
            await service.getString(SettingsKeys.aiOllamaApiKey, AiDefaults.ollamaApiKey),
        ollamaBaseUrl:
            await service.getString(SettingsKeys.aiOllamaBaseUrl, AiDefaults.ollamaBaseUrl),
        ollamaModel:
            await service.getString(SettingsKeys.aiOllamaModel, AiDefaults.ollamaModel),
        ollamaGrammarModel: await service.getString(SettingsKeys.aiOllamaGrammarModel, ''),
        neuralwattApiKey: await service.getString(SettingsKeys.aiNeuralwattApiKey, ''),
        neuralwattBaseUrl: await service
            .getString(SettingsKeys.aiNeuralwattBaseUrl, AiDefaults.neuralwattBaseUrl),
        neuralwattModel:
            await service.getString(SettingsKeys.aiNeuralwattModel, AiDefaults.neuralwattModel),
        neuralwattGrammarModel:
            await service.getString(SettingsKeys.aiNeuralwattGrammarModel, ''),
        customPrompts: (await service.getJsonMap(SettingsKeys.aiCustomPrompts, {}))
            .map((k, v) => MapEntry(k, '$v')),
        favoriteModels: (await service.getJsonList(SettingsKeys.aiFavoriteModels, []))
            .whereType<String>()
            .toList(),
        autoGenerateSummaries:
            await service.getBool(SettingsKeys.autoGenerateSummaries, true),
      );
      this.state = state;

      // Boot the queue with the loaded config.
      final manager = ref.read(aiQueueManagerProvider);
      await manager.initialize(state.toRuntimeConfig());
      logAi.debug('ai config loaded', state.provider);
    } catch (e) {
      logAi.warn('ai config boot failed (continuing)', e);
    }
  }

  Future<void> _save(String key, String value) =>
      ref.read(settingsServiceProvider).setRaw(key, value);

  Future<void> saveProvider(String provider) async {
    await _save(SettingsKeys.aiProvider, provider);
    state = state.copyWith(provider: provider);
    _reconfigureQueue();
  }

  Future<void> saveApiKey(String key) async {
    final isNeural = state.provider == AiProvider.neuralwatt;
    await _save(isNeural ? SettingsKeys.aiNeuralwattApiKey : SettingsKeys.aiOllamaApiKey, key);
    state = isNeural
        ? state.copyWith(neuralwattApiKey: key)
        : state.copyWith(ollamaApiKey: key);
    _reconfigureQueue();
  }

  Future<void> saveBaseUrl(String url) async {
    final isNeural = state.provider == AiProvider.neuralwatt;
    await _save(isNeural ? SettingsKeys.aiNeuralwattBaseUrl : SettingsKeys.aiOllamaBaseUrl, url);
    state = isNeural
        ? state.copyWith(neuralwattBaseUrl: url)
        : state.copyWith(ollamaBaseUrl: url);
    _reconfigureQueue();
  }

  Future<void> saveModel(String model) async {
    final isNeural = state.provider == AiProvider.neuralwatt;
    await _save(isNeural ? SettingsKeys.aiNeuralwattModel : SettingsKeys.aiOllamaModel, model);
    state = isNeural
        ? state.copyWith(neuralwattModel: model)
        : state.copyWith(ollamaModel: model);
    _reconfigureQueue();
  }

  Future<void> saveGrammarModel(String model) async {
    final isNeural = state.provider == AiProvider.neuralwatt;
    await _save(
        isNeural ? SettingsKeys.aiNeuralwattGrammarModel : SettingsKeys.aiOllamaGrammarModel,
        model);
    state = isNeural
        ? state.copyWith(neuralwattGrammarModel: model)
        : state.copyWith(ollamaGrammarModel: model);
    _reconfigureQueue();
  }

  Future<void> savePrompts(Map<String, String> prompts) async {
    await _save(SettingsKeys.aiCustomPrompts, jsonEncode(prompts));
    state = state.copyWith(customPrompts: prompts);
    _reconfigureQueue();
  }

  Future<void> toggleFavoriteModel(String model) async {
    final favorites = [...state.favoriteModels];
    if (favorites.contains(model)) {
      favorites.remove(model);
    } else {
      favorites.add(model);
    }
    await _save(SettingsKeys.aiFavoriteModels, jsonEncode(favorites));
    state = state.copyWith(favoriteModels: favorites);
  }

  Future<void> updateAutoGenerateSummaries(bool enabled) async {
    await _save(SettingsKeys.autoGenerateSummaries, '$enabled');
    state = state.copyWith(autoGenerateSummaries: enabled);
    // Keep the preferences slice in sync (used by the writing flow).
    await ref
        .read(appDataProvider.notifier)
        .setPreference(autoGenerateSummaries: enabled);
  }

  /// Re-initializes the queue with the new runtime config (SPEC: config
  /// changes reset connection state).
  void _reconfigureQueue() {
    final manager = ref.read(aiQueueManagerProvider);
    manager.updateConfig(state.toRuntimeConfig());
    logAi.debug('ai config updated', state.provider);
  }

  /// Pings the server with the current config (used by "Test Connection").
  Future<void> testConnection() async {
    final service = ref.read(aiServiceProvider);
    await service.pingServer(state.toRuntimeConfig());
  }
}

// -- Exported helper: category for a note (SPEC §9) --------------------------------

/// AI job category for a saved note.
String aiCategoryForNote({required bool isAlignmentReflection, required String? personId}) {
  if (isAlignmentReflection) return AiJobCategory.checkin;
  if (personId != null) return AiJobCategory.circle;
  return AiJobCategory.journal;
}
