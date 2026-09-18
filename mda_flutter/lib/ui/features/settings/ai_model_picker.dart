/// Loads the selected provider's models and keeps favorites separate from selection.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../data/ai_providers.dart';
import '../../../data/services/ai_config.dart';
import '../../../data/services/ai_error.dart';

class AiModelPicker extends ConsumerStatefulWidget {
  const AiModelPicker({
    super.key,
    required this.grammar,
    required this.onClose,
  });
  final bool grammar;
  final VoidCallback onClose;

  @override
  ConsumerState<AiModelPicker> createState() => _AiModelPickerState();
}

class _AiModelPickerState extends ConsumerState<AiModelPicker> {
  final _custom = TextEditingController();
  List<String> _models = [];
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final config = ref.read(aiConfigProvider);
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final models = await ref
          .read(aiServiceProvider)
          .fetchAvailableModels(config.toRuntimeConfig());
      if (!mounted) return;
      setState(() => _models = models);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = classifyError(error).uiMessage);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _select(String value) async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final notifier = ref.read(aiConfigProvider.notifier);
      if (widget.grammar) {
        await notifier.saveGrammarModel(value);
      } else {
        await notifier.saveModel(value);
      }
      if (mounted) widget.onClose();
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Could not save the model. Please try again.';
          _saving = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _custom.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final config = ref.watch(aiConfigProvider);
    final fallback = config.provider == AiProvider.ollama
        ? AiDefaults.ollamaModels
        : AiDefaults.neuralwattModels;
    final models =
        {
          ..._models,
          if (_models.isEmpty) ...fallback,
          config.model,
          if (config.grammarModel.isNotEmpty) config.grammarModel,
        }.toList()..sort((a, b) {
          final favoriteOrder =
              (config.favoriteModels.contains(b) ? 1 : 0) -
              (config.favoriteModels.contains(a) ? 1 : 0);
          return favoriteOrder != 0 ? favoriteOrder : a.compareTo(b);
        });
    final selected = widget.grammar ? config.grammarModel : config.model;
    return Material(
      type: MaterialType.transparency,
      child: Column(
        children: [
          if (_loading) const LinearProgressIndicator(minHeight: 2),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: _loading ? null : _load,
                    tooltip: 'Retry',
                    icon: const Icon(Icons.refresh),
                  ),
                ],
              ),
            ),
          TextField(
            controller: _custom,
            decoration: InputDecoration(
              hintText: 'Custom model name',
              suffixIcon: IconButton(
                tooltip: 'Use custom model',
                icon: const Icon(Icons.check),
                onPressed: _saving
                    ? null
                    : () {
                        if (_custom.text.trim().isNotEmpty) {
                          _select(_custom.text.trim());
                        }
                      },
              ),
            ),
            onSubmitted: (value) {
              if (value.trim().isNotEmpty) _select(value.trim());
            },
          ),
          const SizedBox(height: 8),
          Expanded(
            child: ListView(
              children: [
                if (widget.grammar)
                  ListTile(
                    title: const Text('Same as model'),
                    selected: selected.isEmpty,
                    onTap: _saving ? null : () => _select(''),
                  ),
                for (final model in models)
                  ListTile(
                    title: Text(model, style: const TextStyle(fontSize: 14)),
                    selected: model == selected,
                    selectedColor: AppColors.primaryAction,
                    onTap: _saving ? null : () => _select(model),
                    trailing: IconButton(
                      tooltip: config.favoriteModels.contains(model)
                          ? 'Remove favorite'
                          : 'Add favorite',
                      icon: Icon(
                        config.favoriteModels.contains(model)
                            ? Icons.star_rounded
                            : Icons.star_border_rounded,
                        color: config.favoriteModels.contains(model)
                            ? AppColors.gold
                            : AppColors.textMuted,
                      ),
                      onPressed: () => ref
                          .read(aiConfigProvider.notifier)
                          .toggleFavoriteModel(model),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
