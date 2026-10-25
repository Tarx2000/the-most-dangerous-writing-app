/// AiSettingsPanel — AI configuration panel (port of `AiSettingsPanel.tsx`).
/// Provider switch (ChatGPT, Ollama, Neuralwatt, Codex, OpenRouter) ·
/// "Sign in with ChatGPT" OAuth PKCE token sharing · API keys · base URLs ·
/// model pickers with favorite stars · grammar models · custom prompts ·
/// batch processing with progress · test connection · AI status with failure notifications.
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
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/shimmer_line.dart';
import 'ai_model_picker.dart';

class AiSettingsPanel extends ConsumerStatefulWidget {
  const AiSettingsPanel({super.key});

  @override
  ConsumerState<AiSettingsPanel> createState() => _AiSettingsPanelState();
}

class _AiSettingsPanelState extends ConsumerState<AiSettingsPanel> {
  bool _testing = false;
  bool _chatgptBusy = false;
  String? _chatgptStatus;
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

  Future<void> _signInChatGPT() async {
    setState(() {
      _chatgptBusy = true;
      _chatgptStatus = 'Opening browser for ChatGPT authorization…';
    });
    try {
      final result =
          await ref.read(aiConfigProvider.notifier).signInWithChatGPT();
      if (!mounted) return;
      if (result.success) {
        vibrate(HapticPatterns.unlockSuccess);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Successfully connected to your ChatGPT account!'),
            backgroundColor: AppColors.green,
          ),
        );
      } else {
        vibrate(HapticPatterns.dialPress);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              result.errorMessage ?? 'ChatGPT authorization was not completed.',
            ),
            backgroundColor: AppColors.primaryAction,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Sign in error: $e'),
            backgroundColor: AppColors.primaryAction,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _chatgptBusy = false;
          _chatgptStatus = null;
        });
      }
    }
  }

  Future<void> _signOutChatGPT() async {
    final confirmed = await showDialog<bool>(
      context: context,
      barrierColor: AppColors.overlayDark,
      builder: (ctx) => ConfirmDialog(
        title: 'Disconnect ChatGPT?',
        message:
            'This will sign you out of your ChatGPT session. Your AI features will switch back to the local or cloud provider.',
        confirmLabel: 'Disconnect',
        cancelLabel: 'Cancel',
        destructive: true,
        onConfirm: () => Navigator.of(ctx).pop(true),
        onCancel: () => Navigator.of(ctx).pop(false),
      ),
    );
    if (confirmed == true && mounted) {
      await ref.read(aiConfigProvider.notifier).signOutChatGPT();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Disconnected from ChatGPT.'),
          ),
        );
      }
    }
  }

  Future<void> _manageUsage() async {
    await ref.read(aiConfigProvider.notifier).openChatGPTManageUsage();
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
          _testResult = 'Connected. Server reachable.';
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
    final isChatGPT = config.provider == AiProvider.chatgpt;

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
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Auto-generate summaries',
                          style: TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'Generate titles, summaries, and grammar after saves',
                          style: TextStyle(
                            color: AppColors.textMuted,
                            fontSize: 12,
                          ),
                        ),
                      ],
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
            // Provider selector
            _Row(
              icon: isChatGPT ? 'creation' : 'serverNetwork',
              title: 'AI Provider',
              value: switch (config.provider) {
                AiProvider.chatgpt => 'ChatGPT (Plus / Pro)',
                AiProvider.neuralwatt => 'Neuralwatt',
                AiProvider.codex => 'Codex / OpenAI',
                AiProvider.openrouter => 'OpenRouter',
                _ => 'Ollama Cloud',
              },
              valueColor: isChatGPT ? AppColors.green : null,
              onTap: () async {
                final choice = await showActionSheet<String>(
                  context,
                  title: 'AI Provider',
                  selected: config.provider,
                  options: const [
                    ActionSheetOption(
                      value: 'chatgpt',
                      label: 'ChatGPT (Plus / Pro OAuth)',
                      icon: 'creation',
                    ),
                    ActionSheetOption(
                      value: 'ollama',
                      label: 'Ollama Cloud (Default)',
                      icon: 'cloudOutline',
                    ),
                    ActionSheetOption(
                      value: 'neuralwatt',
                      label: 'Neuralwatt',
                      icon: 'lightningBolt',
                    ),
                    ActionSheetOption(
                      value: 'codex',
                      label: 'Codex / OpenAI (API Key)',
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

            // ChatGPT OAuth banner / connected profile card
            if (isChatGPT) ...[
              const _Divider(),
              if (!config.isChatGPTConnected) ...[
                _ChatGPTLoginCard(
                  busy: _chatgptBusy,
                  statusText: _chatgptStatus,
                  onSignIn: _signInChatGPT,
                ),
              ] else ...[
                _ChatGPTConnectedProfileCard(
                  userEmail: config.chatgptUserEmail,
                  userName: config.chatgptUserName,
                  onManageUsage: _manageUsage,
                  onSignOut: _signOutChatGPT,
                ),
              ],
            ],

            // API key & Base URL for standard providers
            if (!isChatGPT) ...[
              const _Divider(),
              _Row(
                icon: 'keyVariant',
                title: config.provider == AiProvider.codex
                    ? 'API Key / Token'
                    : 'API Key',
                value: config.apiKey.isEmpty ? 'Not set' : '••••••••',
                onTap: () => _editKey(),
              ),
              const _Divider(),
              _Row(
                icon: 'web',
                title: 'Base URL',
                value: config.baseUrl,
                onTap: () => _editBaseUrl(),
              ),
            ],

            const _Divider(),
            // Model
            _Row(
              icon: 'brain',
              title: isChatGPT ? 'ChatGPT Model' : 'Model',
              value: config.model,
              onTap: () => _pickModel(grammar: false),
            ),
            const _Divider(),
            // Grammar model
            _Row(
              icon: 'spellcheck',
              title: 'Grammar Model',
              value: config.grammarModel.isEmpty
                  ? 'Same as model'
                  : config.grammarModel,
              onTap: () => _pickModel(grammar: true),
            ),
            const _Divider(),
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
        // Custom Prompts
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
  }) async {
    await showBaseModal(
      context,
      title: title,
      heightFactor: 0.4,
      builder: (close) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: controller,
              obscureText: obscure,
              decoration: InputDecoration(
                labelText: title,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(onPressed: close, child: const Text('Cancel')),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: () async {
                    await onSave();
                    close();
                  },
                  child: const Text('Save'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Sign in with ChatGPT promo & connection card
class _ChatGPTLoginCard extends StatelessWidget {
  const _ChatGPTLoginCard({
    required this.busy,
    required this.statusText,
    required this.onSignIn,
  });

  final bool busy;
  final String? statusText;
  final VoidCallback onSignIn;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF10A37F).withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: const Color(0xFF10A37F).withValues(alpha: 0.25),
          width: 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: const Color(0xFF10A37F).withValues(alpha: 0.2),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.auto_awesome_rounded,
                  color: Color(0xFF10A37F),
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Sign in with ChatGPT',
                      style: TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      'ChatGPT Plus & Pro Token Sharing',
                      style: TextStyle(
                        color: Color(0xFF10A37F),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Text(
            'Log in with your existing ChatGPT account to use models like GPT-4o and o3-mini for reflection, titles, and grammar without needing an OpenAI API key.',
            style: TextStyle(
              color: AppColors.textSecondary,
              fontSize: 13,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 14),
          if (busy) ...[
            Row(
              children: [
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Color(0xFF10A37F),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    statusText ?? 'Connecting to ChatGPT…',
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
          ] else ...[
            AnimatedScaleButton(
              onPress: onSignIn,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF10A37F),
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF10A37F).withValues(alpha: 0.3),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.login_rounded,
                      color: Colors.white,
                      size: 18,
                    ),
                    SizedBox(width: 8),
                    Text(
                      'Continue with ChatGPT',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.3,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Connected ChatGPT account details and usage card
class _ChatGPTConnectedProfileCard extends StatelessWidget {
  const _ChatGPTConnectedProfileCard({
    required this.userEmail,
    required this.userName,
    required this.onManageUsage,
    required this.onSignOut,
  });

  final String userEmail;
  final String userName;
  final VoidCallback onManageUsage;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    final display = userEmail.isNotEmpty
        ? userEmail
        : (userName.isNotEmpty ? userName : 'Connected Account');

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.glassSurfaceMinimal,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: const Color(0xFF10A37F).withValues(alpha: 0.35),
          width: 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: const BoxDecoration(
                  color: Color(0xFF10A37F),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_rounded,
                  color: Colors.white,
                  size: 18,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      display,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const Text(
                      'ChatGPT Plan Usage Active',
                      style: TextStyle(
                        color: Color(0xFF10A37F),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onManageUsage,
                  icon: const Icon(Icons.open_in_new_rounded, size: 14),
                  label: const Text('Manage Usage'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.textPrimary,
                    side: const BorderSide(color: AppColors.glassBorder),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                onPressed: onSignOut,
                icon: const Icon(Icons.logout_rounded, size: 14),
                label: const Text('Disconnect'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.primaryAction,
                  side: const BorderSide(color: AppColors.dangerBorder),
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// -- Reusable visual primitives -----------------------------------------------

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title, {this.icon});
  final String title;
  final String? icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        if (icon != null) ...[
          Icon(Mdi.get(icon!), color: AppColors.textSecondary, size: 16),
          const SizedBox(width: 8),
        ],
        Expanded(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
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

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.glassBackground,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.glassBorder, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children,
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.symmetric(vertical: 8),
    child: Divider(height: 1, color: AppColors.glassBorder),
  );
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
      disabled: onTap == null,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
        decoration: BoxDecoration(
          color: AppColors.glassSurfaceMinimal,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Icon(Mdi.get(icon), color: AppColors.textSecondary, size: 18),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: valueColor ?? AppColors.textMuted,
                  fontSize: 13,
                ),
              ),
            ),
            if (onTap != null) ...[
              const SizedBox(width: 6),
              Icon(
                Mdi.get('chevronRight'),
                color: AppColors.textMuted,
                size: 16,
              ),
            ],
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
        Icon(Mdi.get(icon), color: iconColor, size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                subtitle,
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
          const Icon(Icons.error_outline, color: AppColors.primaryAction, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Note \${notification.noteId}',
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  notification.message,
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: () =>
                ref.read(aiQueueManagerProvider).retryNote(notification.noteId),
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

