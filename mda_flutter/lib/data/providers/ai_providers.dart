/// AI configuration state + queue wiring (Riverpod).
/// The config loads from the settings table (SPEC §7 AI keys) and feeds the
/// singleton [AiQueueManager].
library;

import 'dart:async';
import 'dart:convert' show jsonEncode;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/logger.dart';
import '../queues/ai_queue.dart';
import '../services/ai_config.dart';
import '../services/ai_logger.dart';
import '../services/ai_service.dart';
import '../services/chatgpt_auth_service.dart';
import '../services/settings_service.dart';
import 'providers.dart';

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
    this.chatgptAccessToken = '',
    this.chatgptRefreshToken = '',
    this.chatgptTokenExpiresAt = '',
    this.chatgptUserEmail = '',
    this.chatgptUserName = '',
    this.chatgptClientId = '',
    this.chatgptHostId = '',
    this.chatgptModel = AiDefaults.chatgptModel,
    this.chatgptGrammarModel = '',
    this.chatgptPlanEnabled = false,
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
  final String chatgptAccessToken;
  final String chatgptRefreshToken;
  final String chatgptTokenExpiresAt;
  final String chatgptUserEmail;
  final String chatgptUserName;
  final String chatgptClientId;
  final String chatgptHostId;
  final String chatgptModel;
  final String chatgptGrammarModel;
  final bool chatgptPlanEnabled;
  final Map<String, String> customPrompts;
  final List<String> favoriteModels;
  final bool autoGenerateSummaries;

  bool get isChatGPTConnected =>
      chatgptAccessToken.isNotEmpty && chatgptPlanEnabled;

  String get apiKey => switch (provider) {
    AiProvider.chatgpt => chatgptAccessToken,
    AiProvider.neuralwatt => neuralwattApiKey,
    AiProvider.codex => codexApiKey,
    AiProvider.openrouter => openrouterApiKey,
    _ => ollamaApiKey,
  };

  String get baseUrl => switch (provider) {
    AiProvider.chatgpt => AiDefaults.chatgptBaseUrl,
    AiProvider.neuralwatt => neuralwattBaseUrl,
    AiProvider.codex => codexBaseUrl,
    AiProvider.openrouter => openrouterBaseUrl,
    _ => ollamaBaseUrl,
  };

  String get model => switch (provider) {
    AiProvider.chatgpt => chatgptModel,
    AiProvider.neuralwatt => neuralwattModel,
    AiProvider.codex => codexModel,
    AiProvider.openrouter => openrouterModel,
    _ => ollamaModel,
  };

  String get grammarModel => switch (provider) {
    AiProvider.chatgpt => chatgptGrammarModel,
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
    String? chatgptAccessToken,
    String? chatgptRefreshToken,
    String? chatgptTokenExpiresAt,
    String? chatgptUserEmail,
    String? chatgptUserName,
    String? chatgptClientId,
    String? chatgptHostId,
    String? chatgptModel,
    String? chatgptGrammarModel,
    bool? chatgptPlanEnabled,
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
      chatgptAccessToken: chatgptAccessToken ?? this.chatgptAccessToken,
      chatgptRefreshToken: chatgptRefreshToken ?? this.chatgptRefreshToken,
      chatgptTokenExpiresAt:
          chatgptTokenExpiresAt ?? this.chatgptTokenExpiresAt,
      chatgptUserEmail: chatgptUserEmail ?? this.chatgptUserEmail,
      chatgptUserName: chatgptUserName ?? this.chatgptUserName,
      chatgptClientId: chatgptClientId ?? this.chatgptClientId,
      chatgptHostId: chatgptHostId ?? this.chatgptHostId,
      chatgptModel: chatgptModel ?? this.chatgptModel,
      chatgptGrammarModel: chatgptGrammarModel ?? this.chatgptGrammarModel,
      chatgptPlanEnabled: chatgptPlanEnabled ?? this.chatgptPlanEnabled,
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

final chatgptAuthServiceProvider = Provider<ChatGPTAuthService>((ref) {
  return ChatGPTAuthService(
    settingsService: ref.watch(settingsServiceProvider),
  );
});

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

  /// Loads the persisted AI settings (SPEC §7 keys) in a single DB read (or
  /// reuses [prefetched] when supplied by `StorageNotifier.loadAll`).
  /// Fully guarded: AI boot must never break app startup.
  Future<void> load({Map<String, String>? prefetched}) async {
    try {
      final map =
          prefetched ?? await ref.read(settingsServiceProvider).getAll();
      final state = AiConfigState(
        provider: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiProvider,
          AiProvider.ollama,
        ),
        ollamaApiKey: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiOllamaApiKey,
          AiDefaults.ollamaApiKey,
        ),
        ollamaBaseUrl: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiOllamaBaseUrl,
          AiDefaults.ollamaBaseUrl,
        ),
        ollamaModel: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiOllamaModel,
          AiDefaults.ollamaModel,
        ),
        ollamaGrammarModel: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiOllamaGrammarModel,
          '',
        ),
        neuralwattApiKey: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiNeuralwattApiKey,
          '',
        ),
        neuralwattBaseUrl: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiNeuralwattBaseUrl,
          AiDefaults.neuralwattBaseUrl,
        ),
        neuralwattModel: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiNeuralwattModel,
          AiDefaults.neuralwattModel,
        ),
        neuralwattGrammarModel: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiNeuralwattGrammarModel,
          '',
        ),
        codexApiKey: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiCodexApiKey,
          AiDefaults.codexApiKey,
        ),
        codexBaseUrl: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiCodexBaseUrl,
          AiDefaults.codexBaseUrl,
        ),
        codexModel: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiCodexModel,
          AiDefaults.codexModel,
        ),
        codexGrammarModel: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiCodexGrammarModel,
          '',
        ),
        openrouterApiKey: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiOpenRouterApiKey,
          AiDefaults.openrouterApiKey,
        ),
        openrouterBaseUrl: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiOpenRouterBaseUrl,
          AiDefaults.openrouterBaseUrl,
        ),
        openrouterModel: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiOpenRouterModel,
          AiDefaults.openrouterModel,
        ),
        openrouterGrammarModel: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiOpenRouterGrammarModel,
          '',
        ),
        chatgptAccessToken: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiChatGPTAccessToken,
          '',
        ),
        chatgptRefreshToken: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiChatGPTRefreshToken,
          '',
        ),
        chatgptTokenExpiresAt: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiChatGPTTokenExpiresAt,
          '',
        ),
        chatgptUserEmail: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiChatGPTUserEmail,
          '',
        ),
        chatgptUserName: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiChatGPTUserName,
          '',
        ),
        chatgptClientId: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiChatGPTClientId,
          '',
        ),
        chatgptHostId: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiChatGPTHostId,
          '',
        ),
        chatgptModel: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiChatGPTModel,
          AiDefaults.chatgptModel,
        ),
        chatgptGrammarModel: SettingsService.stringFromMap(
          map,
          SettingsKeys.aiChatGPTGrammarModel,
          '',
        ),
        chatgptPlanEnabled: SettingsService.boolFromMap(
          map,
          SettingsKeys.aiChatGPTPlanEnabled,
          false,
        ),
        customPrompts: SettingsService.jsonMapFromMap(
          map,
          SettingsKeys.aiCustomPrompts,
          const {},
        ).map((k, v) => MapEntry(k, '$v')),
        favoriteModels: SettingsService.jsonListFromMap(
          map,
          SettingsKeys.aiFavoriteModels,
          const [],
        ).whereType<String>().toList(),
        autoGenerateSummaries: SettingsService.boolFromMap(
          map,
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
      AiProvider.chatgpt => SettingsKeys.aiChatGPTAccessToken,
      AiProvider.neuralwatt => SettingsKeys.aiNeuralwattApiKey,
      AiProvider.codex => SettingsKeys.aiCodexApiKey,
      AiProvider.openrouter => SettingsKeys.aiOpenRouterApiKey,
      _ => SettingsKeys.aiOllamaApiKey,
    };
    await _save(settingKey, key);
    state = switch (state.provider) {
      AiProvider.chatgpt => state.copyWith(chatgptAccessToken: key),
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
      AiProvider.chatgpt => SettingsKeys.aiChatGPTModel,
      AiProvider.neuralwatt => SettingsKeys.aiNeuralwattModel,
      AiProvider.codex => SettingsKeys.aiCodexModel,
      AiProvider.openrouter => SettingsKeys.aiOpenRouterModel,
      _ => SettingsKeys.aiOllamaModel,
    };
    await _save(settingKey, model);
    state = switch (state.provider) {
      AiProvider.chatgpt => state.copyWith(chatgptModel: model),
      AiProvider.neuralwatt => state.copyWith(neuralwattModel: model),
      AiProvider.codex => state.copyWith(codexModel: model),
      AiProvider.openrouter => state.copyWith(openrouterModel: model),
      _ => state.copyWith(ollamaModel: model),
    };
    _reconfigureQueue();
  }

  Future<void> saveGrammarModel(String model) async {
    final settingKey = switch (state.provider) {
      AiProvider.chatgpt => SettingsKeys.aiChatGPTGrammarModel,
      AiProvider.neuralwatt => SettingsKeys.aiNeuralwattGrammarModel,
      AiProvider.codex => SettingsKeys.aiCodexGrammarModel,
      AiProvider.openrouter => SettingsKeys.aiOpenRouterGrammarModel,
      _ => SettingsKeys.aiOllamaGrammarModel,
    };
    await _save(settingKey, model);
    state = switch (state.provider) {
      AiProvider.chatgpt => state.copyWith(chatgptGrammarModel: model),
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

  // -- ChatGPT Auth Actions ---------------------------------------------------

  Future<ChatGPTAuthResult> signInWithChatGPT() async {
    final authService = ref.read(chatgptAuthServiceProvider);
    final result = await authService.signIn();
    if (result.success && result.accessToken != null) {
      state = state.copyWith(
        provider: AiProvider.chatgpt,
        chatgptAccessToken: result.accessToken,
        chatgptRefreshToken: result.refreshToken,
        chatgptTokenExpiresAt: result.expiresAt?.toIso8601String(),
        chatgptUserEmail: result.userEmail,
        chatgptUserName: result.userName,
        chatgptClientId: result.clientId,
        chatgptPlanEnabled: result.planSharingEnabled,
      );
      await _save(SettingsKeys.aiProvider, AiProvider.chatgpt);
      _reconfigureQueue();
    }
    return result;
  }

  Future<void> signOutChatGPT() async {
    final authService = ref.read(chatgptAuthServiceProvider);
    await authService.signOut();
    state = state.copyWith(
      chatgptAccessToken: '',
      chatgptRefreshToken: '',
      chatgptTokenExpiresAt: '',
      chatgptUserEmail: '',
      chatgptUserName: '',
      chatgptPlanEnabled: false,
    );
    _reconfigureQueue();
  }

  Future<void> openChatGPTManageUsage() async {
    final authService = ref.read(chatgptAuthServiceProvider);
    await authService.openManageUsage();
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
