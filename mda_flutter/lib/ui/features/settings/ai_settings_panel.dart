/// AiSettingsPanel — AI configuration panel (port of `AiSettingsPanel.tsx`).
/// Provider switch · API key · base URL · model picker with favorite stars ·
/// grammar model · custom prompts · batch processing with progress · test
/// connection · AI status with per-note failure notifications + retry.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/ai_providers.dart';
import '../../../data/queues/ai_queue.dart';
import '../../../data/services/ai_config.dart';
import '../../../data/services/ai_error.dart';
import '../../core/widgets/action_sheet.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/animated_switch.dart';
import '../../core/widgets/base_modal.dart';
import '../../core/widgets/shimmer_line.dart';
import 'ai_model_picker.dart';

class AiSettingsPanel extends ConsumerStatefulWidget {
  const AiSettingsPanel({super.key});

  @override
  ConsumerState<AiSettingsPanel> createState() => _AiSettingsPanelState();
}

class _AiSettingsPanelState extends ConsumerState<AiSettingsPanel> {
  bool _testing = false;
  bool _overwrite = false;
  final Set<String> _categories = {'journal', 'circle', 'checkin'};
  String? _testResult;
  bool _testSuccess = false;
  late final TextEditingController _apiKeyController;
  late final TextEditingController _baseUrlController;
  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    final config = ref.read(aiConfigProvider);
    _apiKeyController = TextEditingController(text: config.apiKey);
    _baseUrlController = TextEditingController(text: config.baseUrl);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initialized) {
      _initialized = true;
      // Sync the controllers whenever the provider switches.
      final config = ref.read(aiConfigProvider);
      if (_apiKeyController.text != config.apiKey) {
        _apiKeyController.text = config.apiKey;
      }
      if (_baseUrlController.text != config.baseUrl) {
        _baseUrlController.text = config.baseUrl;
      }
    }
  }

  @override
  void dispose() {
    _apiKeyController.dispose();
    _baseUrlController.dispose();
    super.dispose();
  }

  Future<void> _testConnection() async {
    setState(() {
      _testing = true;
      _testResult = null;
    });
    try {
      await ref.read(aiConfigProvider.notifier).testConnection();
      if (mounted) {
        setState(() {
          _testing = false;
          _testSuccess = true;
          _testResult = 'Connected. Server is reachable.';
        });
      }
    } on AiError catch (e) {
      if (mounted) {
        setState(() {
          _testing = false;
          _testSuccess = false;
          _testResult = e.uiMessage;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _testing = false;
          _testSuccess = false;
          _testResult = 'Connection failed.';
        });
      }
    }
  }

  Future<void> _pickModel({required bool grammar}) => showBaseModal(
    context,
    title: grammar ? 'Grammar Model' : 'AI Model',
    heightFactor: 0.8,
    builder: (close) => AiModelPicker(grammar: grammar, onClose: close),
  );

  Future<void> _editPrompt(String key) async {
    final config = ref.read(aiConfigProvider);
    final controller = TextEditingController(
      text: config.customPrompts[key] ?? defaultAiPrompts[key],
    );
    await showBaseModal(
      context,
      title: 'Custom Prompt',
      heightFactor: 0.85,
      builder: (close) => Column(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              expands: true,
              minLines: null,
              maxLines: null,
              textAlignVertical: TextAlignVertical.top,
              decoration: const InputDecoration(border: InputBorder.none),
            ),
          ),
          Row(
            children: [
              TextButton(
                onPressed: () {
                  controller.text = defaultAiPrompts[key] ?? '';
                },
                child: const Text('Reset to default'),
              ),
              const Spacer(),
              FilledButton(
                onPressed: () async {
                  final prompts = {...ref.read(aiConfigProvider).customPrompts};
                  final value = controller.text.trim();
                  if (value.isEmpty || value == defaultAiPrompts[key]) {
                    prompts.remove(key);
                  } else {
                    prompts[key] = value;
                  }
                  await ref
                      .read(aiConfigProvider.notifier)
                      .savePrompts(prompts);
                  close();
                },
                child: const Text('Save'),
              ),
            ],
          ),
        ],
      ),
    );
    controller.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final config = ref.watch(aiConfigProvider);
    final queueState = ref.watch(aiQueueStateProvider).value;
    final notifications = ref.watch(aiFailureNotificationsProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader('AI SETTINGS', icon: 'creation'),
        const SizedBox(height: 12),
        _SettingsCard(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Auto-generate summaries',
                      style: TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  AnimatedSwitch(
                    value: config.autoGenerateSummaries,
                    onChanged: (enabled) => ref
                        .read(aiConfigProvider.notifier)
                        .updateAutoGenerateSummaries(enabled),
                  ),
                ],
              ),
            ),
            const _Divider(),
            // Provider switch
            _Row(
              icon: 'serverNetwork',
              title: 'Provider',
              value: switch (config.provider) {
                AiProvider.neuralwatt => 'Neuralwatt',
                AiProvider.codex => 'Codex / OpenAI',
                AiProvider.openrouter => 'OpenRouter',
                _ => 'Ollama Cloud',
              },
              onTap: () async {
                final choice = await showActionSheet<String>(
                  context,
                  title: 'AI Provider',
                  selected: config.provider,
                  options: const [
                    ActionSheetOption(
                      value: 'ollama',
                      label: 'Ollama Cloud',
                      icon: 'cloudOutline',
                    ),
                    ActionSheetOption(
                      value: 'neuralwatt',
                      label: 'Neuralwatt',
                      icon: 'lightningBolt',
                    ),
                    ActionSheetOption(
                      value: 'codex',
                      label: 'Codex / OpenAI',
                      icon: 'codeBraces',
                    ),
                    ActionSheetOption(
                      value: 'openrouter',
                      label: 'OpenRouter',
                      icon: 'routes',
                    ),
                  ],
                );
                if (choice != null) {
                  await ref
                      .read(aiConfigProvider.notifier)
                      .saveProvider(choice);
                }
              },
            ),
            _Divider(),
            // API key
            _Row(
              icon: 'keyVariant',
              title: config.provider == AiProvider.codex
                  ? 'API Key / Token'
                  : 'API Key',
              value: config.apiKey.isEmpty ? 'Not set' : '••••••••',
              onTap: () => _editKey(),
            ),
            _Divider(),
            // Base URL
            _Row(
              icon: 'web',
              title: 'Base URL',
              value: config.baseUrl,
              onTap: () => _editBaseUrl(),
            ),
            _Divider(),
            // Models
            _Row(
              icon: 'brain',
              title: 'Model',
              value: config.model,
              onTap: () => _pickModel(grammar: false),
            ),
            _Divider(),
            _Row(
              icon: 'spellcheck',
              title: 'Grammar Model',
              value: config.grammarModel.isEmpty
                  ? 'Same as model'
                  : config.grammarModel,
              onTap: () => _pickModel(grammar: true),
            ),
            _Divider(),
            // Test connection
            _Row(
              icon: 'lanConnect',
              title: 'Test Connection',
              value: _testing ? 'Testing...' : (_testResult ?? ''),
              valueColor: _testSuccess ? AppColors.green : null,
              onTap: _testing ? null : _testConnection,
            ),
          ],
        ),

        const SizedBox(height: 16),
        ExpansionTile(
          tilePadding: EdgeInsets.zero,
          title: const Text(
            'Custom Prompts',
            style: TextStyle(
              color: AppColors.textPrimary,
              fontWeight: FontWeight.w600,
            ),
          ),
          children: [
            for (final entry in const {
              'title': 'Journal title',
              'summary': 'Journal summary',
              'grammar': 'Grammar check',
              'relationshipTitle': 'Circle title',
              'relationshipSummary': 'Circle summary',
            }.entries)
              _Row(
                icon: 'textBoxOutline',
                title: entry.value,
                value: config.customPrompts.containsKey(entry.key)
                    ? 'Customized'
                    : 'Default',
                onTap: () => _editPrompt(entry.key),
              ),
          ],
        ),
        // AI status + failures
        const SizedBox(height: 16),
        _SectionHeader('AI STATUS', icon: 'informationOutline'),
        const SizedBox(height: 12),
        _SettingsCard(
          children: [
            _StatusRow(
              icon: queueState?.serverOnline ?? true
                  ? 'checkCircle'
                  : 'alertCircle',
              iconColor: queueState?.serverOnline ?? true
                  ? AppColors.green
                  : AppColors.primaryAction,
              title: queueState?.serverOnline ?? true
                  ? 'Server Online'
                  : 'Server Unreachable',
              subtitle:
                  queueState?.lastError ??
                  (queueState?.isProcessing ?? false
                      ? 'Processing...'
                      : 'Idle'),
            ),
            if (notifications.isNotEmpty) ...[
              const _Divider(),
              for (final notification in notifications)
                _FailureRow(notification: notification),
            ],
          ],
        ),

        // Batch processing
        const SizedBox(height: 16),
        _SectionHeader('BATCH PROCESSING', icon: 'layersTripleOutline'),
        const SizedBox(height: 12),
        _SettingsCard(
          children: [
            Row(
              children: [
                Icon(
                  Mdi.get('layersTripleOutline'),
                  color: AppColors.textSecondary,
                  size: 18,
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Process all entries without AI metadata',
                    style: TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: [
                for (final entry in const {
                  'journal': 'Journals',
                  'circle': 'Circles',
                  'checkin': 'Check-ins',
                }.entries)
                  FilterChip(
                    label: Text(entry.value),
                    selected: _categories.contains(entry.key),
                    onSelected: (selected) => setState(() {
                      if (selected) {
                        _categories.add(entry.key);
                      } else {
                        _categories.remove(entry.key);
                      }
                    }),
                  ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Overwrite existing metadata',
                      style: TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  AnimatedSwitch(
                    size: AnimatedSwitchSize.sm,
                    value: _overwrite,
                    onChanged: (value) => setState(() => _overwrite = value),
                  ),
                ],
              ),
            ),
            AnimatedScaleButton(
              onPress: _categories.isEmpty
                  ? null
                  : () async {
                      vibrate(HapticPatterns.dialPress);
                      await ref
                          .read(aiQueueManagerProvider)
                          .enqueueBatch(
                            forceOverwrite: _overwrite,
                            categories: {..._categories},
                          );
                    },
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: AppColors.dangerTint,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.dangerBorder, width: 1),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Mdi.get('creation'),
                      color: AppColors.primaryAction,
                      size: 16,
                    ),
                    const SizedBox(width: 8),
                    const Text(
                      'PROCESS ALL',
                      style: TextStyle(
                        color: AppColors.primaryAction,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (queueState != null &&
                (queueState.isProcessing || queueState.pendingCount > 0)) ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  const ShimmerLine(width: 90, height: 12),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      '${queueState.pendingCount} queued',
                      style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: () =>
                        ref.read(aiQueueManagerProvider).cancelBatch(),
                    child: const Text('Cancel'),
                  ),
                ],
              ),
            ],
          ],
        ),
        const SizedBox(height: 8),
      ],
    );
  }

  Future<void> _editKey() async {
    // Read the active provider each time; switching providers changes credentials.
    _apiKeyController.text = ref.read(aiConfigProvider).apiKey;
    final notifier = ref.read(aiConfigProvider.notifier);
    await _promptField(
      title: 'API Key',
      controller: _apiKeyController,
      obscure: true,
      onSave: () => notifier.saveApiKey(_apiKeyController.text.trim()),
    );
  }

  Future<void> _editBaseUrl() async {
    _baseUrlController.text = ref.read(aiConfigProvider).baseUrl;
    final notifier = ref.read(aiConfigProvider.notifier);
    await _promptField(
      title: 'Base URL',
      controller: _baseUrlController,
      onSave: () => notifier.saveBaseUrl(_baseUrlController.text.trim()),
    );
  }

  Future<void> _promptField({
    required String title,
    required TextEditingController controller,
    required Future<void> Function() onSave,
    bool obscure = false,
  }) {
    return showBaseModal(
      context,
      title: title,
      heightFactor: 0.4,
      builder: (close) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: SingleChildScrollView(
          child: Column(
            children: [
              TextField(
                controller: controller,
                autofocus: true,
                obscureText: obscure,
                style: const TextStyle(
                  color: AppColors.textInput,
                  fontSize: 15,
                ),
                cursorColor: AppColors.primaryAction,
                decoration: const InputDecoration(
                  border: InputBorder.none,
                  hintStyle: TextStyle(color: AppColors.placeholder),
                ),
                onSubmitted: (_) async {
                  await onSave();
                  close();
                },
              ),
              const SizedBox(height: 12),
              AnimatedScaleButton(
                onPress: () async {
                  await onSave();
                  close();
                },
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  decoration: BoxDecoration(
                    color: AppColors.primaryAction,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Text(
                    'SAVE',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: AppColors.primaryActionText,
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title, {required this.icon});

  final String title;
  final String icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(Mdi.get(icon), color: AppColors.textSecondary, size: 16),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            title,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 13,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.5,
            ),
          ),
        ),
      ],
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 1,
      margin: const EdgeInsets.symmetric(vertical: 4),
      color: AppColors.glassBorderSubtle,
    );
  }
}

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.glassBackground,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.glassBorder, width: 1),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: Column(children: children),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.title,
    required this.value,
    this.onTap,
    this.valueColor,
  });

  final String icon;
  final String title;
  final String value;
  final VoidCallback? onTap;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return AnimatedScaleButton(
      onPress: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Icon(Mdi.get(icon), color: AppColors.textSecondary, size: 18),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (value.isNotEmpty)
                    Text(
                      value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: valueColor ?? AppColors.textMuted,
                        fontSize: 12,
                      ),
                    ),
                ],
              ),
            ),
            if (onTap != null)
              Icon(
                Mdi.get('chevronRight'),
                color: AppColors.textMuted,
                size: 18,
              ),
          ],
        ),
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
  });

  final String icon;
  final Color iconColor;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(Mdi.get(icon), color: iconColor, size: 18),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (subtitle.isNotEmpty)
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 12,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _FailureRow extends ConsumerWidget {
  const _FailureRow({required this.notification});

  final AiFailureNotification notification;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(
            Mdi.get(
              notification.isTimeout ? 'timerOffOutline' : 'alertCircleOutline',
            ),
            color: AppColors.primaryAction,
            size: 16,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  notification.message,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          AnimatedScaleButton(
            onPress: () {
              final manager = ref.read(aiQueueManagerProvider);
              manager.retryNote(notification.noteId);
              manager.dismissNotification(notification.id);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.glassSurfaceLow,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: AppColors.glassBorderSubtle,
                  width: 1,
                ),
              ),
              child: const Text(
                'Retry',
                style: TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
