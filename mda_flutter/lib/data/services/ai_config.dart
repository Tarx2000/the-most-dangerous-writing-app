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
  'title':
      'You are a minimalist title generator. Read the following journal entry and generate a title of EXACTLY 3 to 6 words. Capitalize it like a book title. Do not use punctuation. Do not use quotes. Capture the exact emotional or factual essence of the text using words closely matching the entry. Reply with ONLY the title, nothing else.',
  'summary':
      'You are the empathetic, reflective, yet logical inner voice of the writer. Summarize the following journal entry.\n'
      'Rules:\n'
      '- Scale length with the input: 1-2 bullet points for short texts, up to 6-8 for long entries.\n'
      '- Explicitly point out any actionable items ("Calls to Action").\n'
      '- Highlight important reflections in the first-person perspective ("I realized...", "I felt...").\n'
      '- Organize chaotic "brain dumps" into coherent, logical points but retain the raw emotional vibe.\n'
      '- NEVER refer to "the author" or "the writer".\n'
      '- Use bold (**text**) to highlight key words.\n'
      'Format: start each bullet with "• ". Reply with ONLY the bullet points, nothing else.',
  'grammar':
      'You are a professional proofreader. Given a journal entry, find all grammar and spelling errors. For each issue, return a JSON array of objects with these fields:\n'
      '- "original": the exact word or phrase with the error (must match the text exactly)\n'
      '- "suggestion": the corrected version\n'
      '- "explanation": a brief explanation of the fix (10 words max)\n\n'
      'If there are no issues, return an empty array: []\n'
      'Reply with ONLY valid JSON, no markdown code fences, no extra text.',
  'relationshipTitle':
      'You are a short label generator for a relationship journal. Read the following entry about {{PERSON_NAME}} ({{RELATIONSHIP_STATUS}}) and generate a very short, event-focused label of 2 to 5 words that captures what happened or what the key topic was. Do NOT include the person\'s name in the label — the reader already knows who the entry is about. Do not use punctuation or quotes. Always respond in the same language the entry was written in. Reply with ONLY the label, nothing else.',
  'relationshipSummary':
      'You are the warm, reflective inner voice of the writer. Summarize the following journal entry about {{PERSON_NAME}} ({{RELATIONSHIP_STATUS}}).\n'
      'Rules:\n'
      '- Write as if you are the author\'s internal narrator — warm and clean, not a cold third-person analyst.\n'
      '- Focus primarily on {{PERSON_NAME}} and what happened, and secondly on the underlying relationship dynamic.\n'
      '- Use {{PERSON_NAME}}\'s name naturally where it flows, but don\'t overuse it — reference them as "they" or "them" when the context is clear.\n'
      '- If a conflict is mentioned, go one layer deeper: name the underlying dynamic behind the surface issue (e.g., "The argument was about dishes, but the tension underneath is about feeling unappreciated").\n'
      '- Do NOT give advice, solutions, or judgments. Just reflect and summarize.\n'
      '- Scale length with the input: 1-2 bullet points for short texts, up to 5-6 for long entries.\n'
      '- ONLY include a "Call to Action" if the author explicitly mentions one in the text.\n'
      '- Always respond in the same language the entry was written in.\n'
      '- Use bold (**text**) to highlight key words.\n'
      'Format: start each bullet with "• ". Reply with ONLY the bullet points, nothing else.',
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
