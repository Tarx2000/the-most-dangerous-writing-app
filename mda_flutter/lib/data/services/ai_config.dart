/// AI configuration model + defaults (SPEC §2, §9) — port of `src/config/ai.ts`.
library;

/// Active AI provider id.
class AiProvider {
  static const ollama = 'ollama';
  static const neuralwatt = 'neuralwatt';
}

/// The resolved per-provider runtime configuration.
class AiConfig {
  const AiConfig({
    required this.provider,
    required this.apiKey,
    required this.baseUrl,
    required this.model,
    required this.grammarModel,
    this.prompts = const {},
  });

  final String provider;
  final String apiKey;
  final String baseUrl;

  /// Title/summary model.
  final String model;

  /// Dedicated grammar model (falls back to [model] when empty).
  final String grammarModel;

  /// Custom prompt overrides merged over the defaults.
  final Map<String, String> prompts;

  String get effectiveGrammarModel => grammarModel.isEmpty ? model : grammarModel;

  AiConfig copyWith({
    String? provider,
    String? apiKey,
    String? baseUrl,
    String? model,
    String? grammarModel,
    Map<String, String>? prompts,
  }) {
    return AiConfig(
      provider: provider ?? this.provider,
      apiKey: apiKey ?? this.apiKey,
      baseUrl: baseUrl ?? this.baseUrl,
      model: model ?? this.model,
      grammarModel: grammarModel ?? this.grammarModel,
      prompts: prompts ?? this.prompts,
    );
  }
}

/// Defaults per provider (SPEC §9).
class AiDefaults {
  static const ollamaBaseUrl = 'https://ollama.com/v1';
  static const ollamaModel = 'gemma4:31b-cloud';
  static const neuralwattBaseUrl = 'https://api.neuralwatt.com/v1';
  static const neuralwattModel = 'glm-5.2';

  /// Ollama ships a bundled default key (parity with the RN app).
  static const ollamaApiKey = '0256ae2a4fa64e95980bc0c6d6177e3d.5l7X5me0ClCd9Nnx3pUKJIKS';

  /// Selectable Ollama models (settings picker).
  static const List<String> ollamaModels = [
    'kimi-k2.5:cloud',
    'kimi-k2.6:cloud',
    'qwen3.5:397b-cloud',
    'glm-5:cloud',
    'minimax-m2.7:cloud',
    'nemotron-3-super:cloud',
    'gemma4:31b-cloud',
  ];

  /// Selectable Neuralwatt models.
  static const List<String> neuralwattModels = ['glm-5.2'];
}

/// Default prompts — verbatim semantics of `src/config/ai.ts` (SPEC §9).
const Map<String, String> defaultAiPrompts = {
  'title': "You are a minimalist title generator for a personal journal entry. "
      "Generate a title of EXACTLY 3 to 6 words. Capitalize it like a book title. "
      "Do not use punctuation. Do not use quotes. "
      "Reply with ONLY the title, nothing else.",
  'summary': "You are an empathetic inner voice reflecting on the journal entry. "
      "Write a concise summary: 1-2 bullets for short texts, up to 6-8 for long ones. "
      "Use first-person reflections ('I realized...'). Bold key insights with **text**. "
      "Prefix every bullet with '• '. Never refer to 'the author'.",
  'grammar': "You are a professional proofreader. Check the text for grammar and "
      "spelling mistakes. Reply with ONLY a JSON array of objects with keys "
      "original, suggestion and explanation (explanation max 10 words). "
      "Return [] if the text is clean. No markdown fences.",
  'relationshipTitle': "Generate an event-focused label for this relationship note "
      "of EXACTLY 2 to 5 words. Do not use the person's name. Same language as the entry.",
  'relationshipSummary': "You are a warm internal narrator focused on this person and "
      "the relationship dynamics in the entry. If there is conflict, go one layer "
      "deeper. No advice or judgment. A CTA only if the author mentioned one. "
      "Same language as the entry. Prefix every bullet with '• '.",
};

/// Timing/retry constants (SPEC §9).
class AiTiming {
  static const healthCheckIntervalMs = 10000;
  static const healthCheckPersistentlyOfflineMs = 60000;
  static const rateLimitDelayMs = 500;
  static const maxRetries = 2;
  static const logMaxEntries = 200;
  static const requestTimeoutMs = 180000;
  static const jobTimeoutMs = 180000;
  static const stallDetectionMs = 60000;
  static const maxQueueSize = 1000;
  static const persistentOfflineThreshold = 3;
}

/// AI job categories (SPEC §9: journal → circle → checkin).
class AiJobCategory {
  static const journal = 'journal';
  static const circle = 'circle';
  static const checkin = 'checkin';

  static int orderOf(String category) {
    switch (category) {
      case circle:
        return 1;
      case checkin:
        return 2;
      default:
        return 0;
    }
  }
}

/// Relationship context injected into circle prompts (SPEC §9).
class RelationshipContext {
  const RelationshipContext({required this.personName, required this.relationshipStatus});

  final String personName;
  final String relationshipStatus;
}
