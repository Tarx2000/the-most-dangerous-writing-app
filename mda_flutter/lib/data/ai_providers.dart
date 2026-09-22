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
    this.codexApiKey = AiDefaults.codexApiKey,
    this.codexBaseUrl = AiDefaults.codexBaseUrl,
    this.codexModel = AiDefaults.codexModel,
    this.codexGrammarModel = '',
    this.openrouterApiKey = AiDefaults.openrouterApiKey,
    this.openrouterBaseUrl = AiDefaults.openrouterBaseUrl,
    this.openrouterModel = AiDefaults.openrouterModel,
    this.openrouterGrammarModel = '',
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
  final String codexApiKey;
  final String codexBaseUrl;
  final String codexModel;
  final String codexGrammarModel;
  final String openrouterApiKey;
  final String openrouterBaseUrl;
  final String openrouterModel;
  final String openrouterGrammarModel;
  final Map<String, String> customPrompts;
  final List<String> favoriteModels;
  final bool autoGenerateSummaries;

  String get apiKey => switch (provider) {
        AiProvider.neuralwatt => neuralwattApiKey,
        AiProvider.codex => codexApiKey,
        AiProvider.openrouter => openrouterApiKey,
        _ => ollamaApiKey,
      };

  String get baseUrl => switch (provider) {
        AiProvider.neuralwatt => neuralwattBaseUrl,
        AiProvider.codex => codexBaseUrl,
        AiProvider.openrouter => openrouterBaseUrl,
        _ => ollamaBaseUrl,
      };

  String get model => switch (provider) {
        AiProvider.neuralwatt => neuralwattModel,
        AiProvider.codex => codexModel,
        AiProvider.openrouter => openrouterModel,
        _ => ollamaModel,
      };

  String get grammarModel => switch (provider) {
        AiProvider.neuralwatt => neuralwattGrammarModel,
        AiProvider.codex => codexGrammarModel,
        AiProvider.openrouter => openrouterGrammarModel,
        _ => ollamaGrammarModel,
      };

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
    String? codexApiKey,
    String? codexBaseUrl,
    String? codexModel,
    String? codexGrammarModel,
    String? openrouterApiKey,
    String? openrouterBaseUrl,
    String? openrouterModel,
    String? openrouterGrammarModel,
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
      neuralwattGrammarModel:
          neuralwattGrammarModel ?? this.neuralwattGrammarModel,
      codexApiKey: codexApiKey ?? this.codexApiKey,
      codexBaseUrl: codexBaseUrl ?? this.codexBaseUrl,
      codexModel: codexModel ?? this.codexModel,
      codexGrammarModel: codexGrammarModel ?? this.codexGrammarModel,
      openrouterApiKey: openrouterApiKey ?? this.openrouterApiKey,
      openrouterBaseUrl: openrouterBaseUrl ?? this.openrouterBaseUrl,
      openrouterModel: openrouterModel ?? this.openrouterModel,
      openrouterGrammarModel:
          openrouterGrammarModel ?? this.openrouterGrammarModel,
      customPrompts: customPrompts ?? this.customPrompts,
      favoriteModels: favoriteModels ?? this.favoriteModels,
      autoGenerateSummaries:
          autoGenerateSummaries ?? this.autoGenerateSummaries,
    );
  }
}

// -- Providers ----------------------------------------------------------------------

final aiConfigProvider = NotifierProvider<AiConfigNotifier, AiConfigState>(
  AiConfigNotifier.new,
);

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
      updateNote: (id, updates) =>
          ref.read(appDataProvider.notifier).updateNote(id, updates),
      getPersonName: (personId) async {
        final person = await ref
            .read(personsRepositoryProvider)
            .getPersonById(personId);
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
  // Riverpod owns the one stream subscription. Buffer the initial snapshot
  // until it subscribes; a broadcast stream would silently drop that event.
  final controller = StreamController<AiQueueState>();
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
final aiFailureNotificationsProvider = Provider<List<AiFailureNotification>>((
  ref,
) {
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
        provider: await service.getString(
          SettingsKeys.aiProvider,
          AiProvider.ollama,
        ),
        ollamaApiKey: await service.getString(
          SettingsKeys.aiOllamaApiKey,
          AiDefaults.ollamaApiKey,
        ),
        ollamaBaseUrl: await service.getString(
          SettingsKeys.aiOllamaBaseUrl,
          AiDefaults.ollamaBaseUrl,
        ),
        ollamaModel: await service.getString(
          SettingsKeys.aiOllamaModel,
          AiDefaults.ollamaModel,
        ),
        ollamaGrammarModel: await service.getString(
          SettingsKeys.aiOllamaGrammarModel,
          '',
        ),
        neuralwattApiKey: await service.getString(
          SettingsKeys.aiNeuralwattApiKey,
          '',
        ),
        neuralwattBaseUrl: await service.getString(
          SettingsKeys.aiNeuralwattBaseUrl,
          AiDefaults.neuralwattBaseUrl,
        ),
        neuralwattModel: await service.getString(
          SettingsKeys.aiNeuralwattModel,
          AiDefaults.neuralwattModel,
        ),
        neuralwattGrammarModel: await service.getString(
          SettingsKeys.aiNeuralwattGrammarModel,
          '',
        ),
        codexApiKey: await service.getString(
          SettingsKeys.aiCodexApiKey,
          AiDefaults.codexApiKey,
        ),
        codexBaseUrl: await service.getString(
          SettingsKeys.aiCodexBaseUrl,
          AiDefaults.codexBaseUrl,
        ),
        codexModel: await service.getString(
          SettingsKeys.aiCodexModel,
          AiDefaults.codexModel,
        ),
        codexGrammarModel: await service.getString(
          SettingsKeys.aiCodexGrammarModel,
          '',
        ),
        openrouterApiKey: await service.getString(
          SettingsKeys.aiOpenRouterApiKey,
          AiDefaults.openrouterApiKey,
        ),
        openrouterBaseUrl: await service.getString(
          SettingsKeys.aiOpenRouterBaseUrl,
          AiDefaults.openrouterBaseUrl,
        ),
        openrouterModel: await service.getString(
          SettingsKeys.aiOpenRouterModel,
          AiDefaults.openrouterModel,
        ),
        openrouterGrammarModel: await service.getString(
          SettingsKeys.aiOpenRouterGrammarModel,
          '',
        ),
        customPrompts: (await service.getJsonMap(
          SettingsKeys.aiCustomPrompts,
          {},
        )).map((k, v) => MapEntry(k, '$v')),
        favoriteModels: (await service.getJsonList(
          SettingsKeys.aiFavoriteModels,
          [],
        )).whereType<String>().toList(),
        autoGenerateSummaries: await service.getBool(
          SettingsKeys.autoGenerateSummaries,
          true,
        ),
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
    final settingKey = switch (state.provider) {
      AiProvider.neuralwatt => SettingsKeys.aiNeuralwattApiKey,
      AiProvider.codex => SettingsKeys.aiCodexApiKey,
      AiProvider.openrouter => SettingsKeys.aiOpenRouterApiKey,
      _ => SettingsKeys.aiOllamaApiKey,
    };
    await _save(settingKey, key);
    state = switch (state.provider) {
      AiProvider.neuralwatt => state.copyWith(neuralwattApiKey: key),
      AiProvider.codex => state.copyWith(codexApiKey: key),
      AiProvider.openrouter => state.copyWith(openrouterApiKey: key),
      _ => state.copyWith(ollamaApiKey: key),
    };
    _reconfigureQueue();
  }

  Future<void> saveBaseUrl(String url) async {
    final settingKey = switch (state.provider) {
      AiProvider.neuralwatt => SettingsKeys.aiNeuralwattBaseUrl,
      AiProvider.codex => SettingsKeys.aiCodexBaseUrl,
      AiProvider.openrouter => SettingsKeys.aiOpenRouterBaseUrl,
      _ => SettingsKeys.aiOllamaBaseUrl,
    };
    await _save(settingKey, url);
    state = switch (state.provider) {
      AiProvider.neuralwatt => state.copyWith(neuralwattBaseUrl: url),
      AiProvider.codex => state.copyWith(codexBaseUrl: url),
      AiProvider.openrouter => state.copyWith(openrouterBaseUrl: url),
      _ => state.copyWith(ollamaBaseUrl: url),
    };
    _reconfigureQueue();
  }

  Future<void> saveModel(String model) async {
    final settingKey = switch (state.provider) {
      AiProvider.neuralwatt => SettingsKeys.aiNeuralwattModel,
      AiProvider.codex => SettingsKeys.aiCodexModel,
      AiProvider.openrouter => SettingsKeys.aiOpenRouterModel,
      _ => SettingsKeys.aiOllamaModel,
    };
    await _save(settingKey, model);
    state = switch (state.provider) {
      AiProvider.neuralwatt => state.copyWith(neuralwattModel: model),
      AiProvider.codex => state.copyWith(codexModel: model),
      AiProvider.openrouter => state.copyWith(openrouterModel: model),
      _ => state.copyWith(ollamaModel: model),
    };
    _reconfigureQueue();
  }

  Future<void> saveGrammarModel(String model) async {
    final settingKey = switch (state.provider) {
      AiProvider.neuralwatt => SettingsKeys.aiNeuralwattGrammarModel,
      AiProvider.codex => SettingsKeys.aiCodexGrammarModel,
      AiProvider.openrouter => SettingsKeys.aiOpenRouterGrammarModel,
      _ => SettingsKeys.aiOllamaGrammarModel,
    };
    await _save(settingKey, model);
    state = switch (state.provider) {
      AiProvider.neuralwatt => state.copyWith(neuralwattGrammarModel: model),
      AiProvider.codex => state.copyWith(codexGrammarModel: model),
      AiProvider.openrouter => state.copyWith(openrouterGrammarModel: model),
      _ => state.copyWith(ollamaGrammarModel: model),
    };
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
String aiCategoryForNote({
  required bool isAlignmentReflection,
  required String? personId,
}) {
  if (isAlignmentReflection) return AiJobCategory.checkin;
  if (personId != null) return AiJobCategory.circle;
  return AiJobCategory.journal;
}
