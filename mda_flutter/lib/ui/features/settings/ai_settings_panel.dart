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
import '../../core/widgets/base_modal.dart';
import '../../core/widgets/shimmer_line.dart';

class AiSettingsPanel extends ConsumerStatefulWidget {
  const AiSettingsPanel({super.key});

  @override
  ConsumerState<AiSettingsPanel> createState() => _AiSettingsPanelState();
}

class _AiSettingsPanelState extends ConsumerState<AiSettingsPanel> {
  bool _testing = false;
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
          _testResult = 'Connected! Server is reachable.';
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

  Future<void> _pickModel({required bool grammar}) async {
    final config = ref.read(aiConfigProvider);
    final isOllama = config.provider == AiProvider.ollama;
    final models = isOllama ? AiDefaults.ollamaModels : AiDefaults.neuralwattModels;
    final selected = grammar ? config.grammarModel : config.model;

    final choice = await showActionSheet<String>(
      context,
      title: grammar ? 'Grammar Model' : 'AI Model',
      selected: selected.isEmpty ? models.first : selected,
      options: [
        for (final model in models)
          ActionSheetOption(
            value: model,
            label: model,
            icon: 'brain',
            favorite: config.favoriteModels.contains(model),
          ),
      ],
    );
    if (choice == null) return;
    final notifier = ref.read(aiConfigProvider.notifier);
    if (grammar) {
      await notifier.saveGrammarModel(choice);
    } else {
      await notifier.saveModel(choice);
      await notifier.toggleFavoriteModel(choice);
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = ref.watch(aiConfigProvider);
    final queueState = ref.watch(aiQueueStateProvider).value;
    final notifications = ref.watch(aiFailureNotificationsProvider);
    final isOllama = config.provider == AiProvider.ollama;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader('AI SETTINGS', icon: 'creation'),
        const SizedBox(height: 12),
        _SettingsCard(
          children: [
            // Provider switch
            _Row(
              icon: 'serverNetwork',
              title: 'Provider',
              value: isOllama ? 'Ollama Cloud' : 'Neuralwatt',
              onTap: () async {
                final choice = await showActionSheet<String>(
                  context,
                  title: 'AI Provider',
                  selected: config.provider,
                  options: const [
                    ActionSheetOption(value: 'ollama', label: 'Ollama Cloud', icon: 'cloudOutline'),
                    ActionSheetOption(value: 'neuralwatt', label: 'Neuralwatt', icon: 'lightningBolt'),
                  ],
                );
                if (choice != null) {
                  await ref.read(aiConfigProvider.notifier).saveProvider(choice);
                }
              },
            ),
            _Divider(),
            // API key
            _Row(
              icon: 'keyVariant',
              title: 'API Key',
              value: config.apiKey.isEmpty
                  ? 'Not set'
                  : '${config.apiKey.substring(0, config.apiKey.length ~/ 2)}...',
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
              value: config.grammarModel.isEmpty ? 'Same as model' : config.grammarModel,
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

        // AI status + failures
        const SizedBox(height: 16),
        _SectionHeader('AI STATUS', icon: 'informationOutline'),
        const SizedBox(height: 12),
        _SettingsCard(
          children: [
            _StatusRow(
              icon: queueState?.serverOnline ?? true ? 'checkCircle' : 'alertCircle',
              iconColor: queueState?.serverOnline ?? true ? AppColors.green : AppColors.primaryAction,
              title: queueState?.serverOnline ?? true ? 'Server Online' : 'Server Unreachable',
              subtitle: queueState?.lastError ?? (queueState?.isProcessing ?? false ? 'Processing...' : 'Idle'),
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
                Icon(Mdi.get('layersTripleOutline'), color: AppColors.textSecondary, size: 18),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Process all entries without AI metadata',
                    style: TextStyle(color: AppColors.textPrimary, fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            AnimatedScaleButton(
              onPress: () async {
                vibrate(HapticPatterns.dialPress);
                await ref.read(aiQueueManagerProvider).enqueueBatch();
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
                    Icon(Mdi.get('creation'), color: AppColors.primaryAction, size: 16),
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
            if (queueState != null && (queueState.isProcessing || queueState.pendingCount > 0)) ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  const ShimmerLine(width: 90, height: 12),
                  const SizedBox(width: 10),
                  Text(
                    '${queueState.pendingCount} queued',
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
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
    final notifier = ref.read(aiConfigProvider.notifier);
    await _promptField(
      title: 'API Key',
      controller: _apiKeyController,
      obscure: true,
      onSave: () => notifier.saveApiKey(_apiKeyController.text.trim()),
    );
  }

  Future<void> _editBaseUrl() async {
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
        child: Column(
          children: [
            TextField(
              controller: controller,
              autofocus: true,
              obscureText: obscure,
              style: const TextStyle(color: AppColors.textInput, fontSize: 15),
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
        Text(
          title,
          style: const TextStyle(
            color: AppColors.textSecondary,
            fontSize: 13,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.5,
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
      child: Column(children: children),
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
              Icon(Mdi.get('chevronRight'), color: AppColors.textMuted, size: 18),
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
                style: const TextStyle(color: AppColors.textPrimary, fontSize: 15, fontWeight: FontWeight.w600),
              ),
              if (subtitle.isNotEmpty)
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
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
            Mdi.get(notification.isTimeout ? 'timerOffOutline' : 'alertCircleOutline'),
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
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                ),
              ],
            ),
          ),
          if (!notification.isPermanent)
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
                  border: Border.all(color: AppColors.glassBorderSubtle, width: 1),
                ),
                child: const Text(
                  'Retry',
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w700),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

