/// SettingsModal — the full settings sheet (SPEC §15, port of `SettingsModal.tsx`).
/// Version chip · Appearance (fonts + reading size + preview) · Security &
/// Storage · Feed & System · Backup & Import · CompressionStatusBar ·
/// AI panel · Developer tools.
library;

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/config/app_config.dart';
import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/providers.dart';
import '../../../data/services/backup_service.dart';
import '../../core/widgets/action_sheet.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/base_modal.dart';
import '../../core/widgets/settings_primitives.dart';
import 'ai_settings_panel.dart';
import 'compression_status_bar.dart';
import 'developer_tools_panel.dart';

/// Font label list (SPEC §4) — 0..2 system, 3..10 bundled Google fonts.
const List<String> _fontLabels = [
  'System', 'Serif', 'Casual',
  'Playfair', 'Mono', 'Hand', 'Lora', 'Zilla', 'Crimson', 'Sans', 'Eagle',
];

/// Mapping fontIndex → TextStyle family (null = platform default).
String? fontFamilyForIndex(int index) {
  switch (index) {
    case 0:
      return null;
    case 1:
      return 'serif';
    case 2:
      return 'casual';
    case 3:
      return 'PlayfairDisplay';
    case 4:
      return 'SpaceMono';
    case 5:
      return 'Caveat';
    case 6:
      return 'Lora';
    case 7:
      return 'ZillaSlab';
    case 8:
      return 'CrimsonPro';
    case 9:
      return 'DMSans';
    case 10:
      return 'EagleLake';
    default:
      return null;
  }
}

class SettingsModal extends ConsumerStatefulWidget {
  const SettingsModal({super.key, required this.onClose});

  final VoidCallback onClose;

  @override
  ConsumerState<SettingsModal> createState() => _SettingsModalState();
}

class _SettingsModalState extends ConsumerState<SettingsModal> {
  bool _backupBusy = false;
  String? _backupStatus;

  Future<void> _openExport() async {
    final scopes = await showActionSheet<String>(
      context,
      title: 'Export Backup',
      selected: 'notes',
      options: [
        for (final scope in backupScopes)
          ActionSheetOption(value: scope, label: _scopeLabel(scope), icon: _scopeIcon(scope)),
      ],
    );
    if (scopes == null) return;
    vibrate(HapticPatterns.backupOp);
    setState(() {
      _backupBusy = true;
      _backupStatus = 'Creating backup ZIP...';
    });
    final result = await ref.read(appDataProvider.notifier).exportBackupZip([scopes]);
    if (!mounted) return;
    setState(() {
      _backupBusy = false;
      _backupStatus = result.success ? 'Backup created — sharing...' : 'Backup failed';
    });
    if (result.success && result.zipPath != null) {
      await SharePlus.instance.share(ShareParams(files: [XFile(result.zipPath!)]));
    }
    if (mounted) {
      setState(() => _backupStatus = null);
      if (!result.success) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(result.error ?? 'Backup failed'),
          backgroundColor: AppColors.primaryAction,
        ));
      }
    }
  }

  Future<void> _openImport() async {
    vibrate(HapticPatterns.backupOp);
    const typeGroup = XTypeGroup(label: 'ZIP', extensions: ['zip']);
    final file = await openFile(acceptedTypeGroups: [typeGroup]);
    if (file == null) return;

    setState(() {
      _backupBusy = true;
      _backupStatus = 'Wiping and importing backup...';
    });
    final result = await ref
        .read(appDataProvider.notifier)
        .importBackupZip(file.path);
    if (!mounted) return;
    setState(() {
      _backupBusy = false;
      _backupStatus = null;
    });
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(result.success
          ? 'Backup restored successfully.'
          : (result.error ?? 'Import failed')),
      backgroundColor: result.success ? AppColors.green : AppColors.primaryAction,
    ));
  }

  static String _scopeLabel(String scope) {
    switch (scope) {
      case 'settings':
        return 'Settings';
      case 'notes':
        return 'Notes & Circles';
      case 'masteries':
        return 'Masteries';
      case 'vlogs':
        return 'Vlogs';
      default:
        return scope;
    }
  }

  static String _scopeIcon(String scope) {
    switch (scope) {
      case 'settings':
        return 'cogOutline';
      case 'notes':
        return 'notebookEditOutline';
      case 'masteries':
        return 'pillar';
      case 'vlogs':
        return 'videoOutline';
      default:
        return 'fileOutline';
    }
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(preferencesProvider);
    final vlogs = ref.watch(vlogsProvider);
    final totalBytes = vlogs.fold<int>(0, (sum, v) => sum + v.fileSizeBytes);

    return Column(
      children: [
        // Version chip
        AnimatedScaleButton(
          onPress: () => _openChangelog(),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.glassSurface,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              'v$appVersion',
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // -- Appearance -------------------------------------------------
                const SettingsSectionHeader('APPEARANCE', icon: 'paletteOutline'),
                const SizedBox(height: 12),
                SettingsCard(
                  children: [
                    _FontPicker(prefs: prefs),
                    const SettingsDivider(),
                    _ReadingSizePicker(prefs: prefs),
                    const SettingsDivider(),
                    _LivePreview(prefs: prefs),
                  ],
                ),

                // -- Security & Storage -----------------------------------------
                const SettingsSectionHeader('SECURITY & STORAGE', icon: 'shieldLockOutline'),
                const SizedBox(height: 12),
                SettingsCard(
                  children: [
                    SettingsRow(
                      icon: 'pinOutline',
                      title: 'Force PIN Auth',
                      subtitle: 'Prefer the PIN pad over biometrics',
                      value: '',
                      onTap: null,
                    ),
                    _PrefToggleRow(
                      title: 'Force PIN Auth',
                      subtitle: 'Prefer the PIN pad over biometrics',
                      icon: 'pinOutline',
                      value: prefs.preferPinAuth,
                      onChanged: (v) => ref
                          .read(appDataProvider.notifier)
                          .setPreference(preferPinAuth: v),
                    ),
                    const SettingsDivider(),
                    SettingsRow(
                      icon: 'timerOutline',
                      title: 'Inactivity Lock',
                      subtitle: 'Lock after this many minutes idle',
                      value: prefs.lockTimeoutMins == 0
                          ? 'Off'
                          : '${prefs.lockTimeoutMins} min',
                      onTap: () => _pickLockTimeout(prefs.lockTimeoutMins),
                    ),
                    const SettingsDivider(),
                    SettingsRow(
                      icon: 'harddisk',
                      title: 'Vlog Footprint',
                      subtitle: 'Storage used by recorded videos',
                      value: _formatBytes(totalBytes),
                    ),
                    const SettingsDivider(),
                    SettingsRow(
                      icon: 'videoOutline',
                      title: 'Vlog Quality',
                      subtitle: 'Recording resolution',
                      value: prefs.vlogQuality,
                      onTap: () => _pickVlogQuality(prefs.vlogQuality),
                    ),
                    const SettingsDivider(),
                    SettingsRow(
                      icon: 'archiveOutline',
                      title: 'Compression Preset',
                      subtitle: 'Balance size and quality after recording',
                      value: prefs.compressionPreset.toUpperCase(),
                      onTap: () => _pickCompressionPreset(prefs.compressionPreset),
                    ),
                  ],
                ),

                // -- Feed & System ----------------------------------------------
                const SettingsSectionHeader('FEED & SYSTEM', icon: 'twitter'),
                const SizedBox(height: 12),
                SettingsCard(
                  children: [
                    _PrefToggleRow(
                      title: 'Haptic Feedback',
                      subtitle: 'Vibrations throughout the app',
                      icon: 'vibrate',
                      value: prefs.enableHaptics,
                      onChanged: (v) => ref
                          .read(appDataProvider.notifier)
                          .setPreference(enableHaptics: v),
                    ),
                    const SettingsDivider(),
                    _PrefToggleRow(
                      title: 'Auto-play Videos',
                      subtitle: 'Play feed videos when visible',
                      icon: 'playCircleOutline',
                      value: ref.watch(feedDataProvider).autoPlayFeedVideos,
                      onChanged: (v) => ref
                          .read(appDataProvider.notifier)
                          .toggleAutoPlayFeedVideos(v),
                    ),
                  ],
                ),

                // -- Backup & Import --------------------------------------------
                const SettingsSectionHeader('BACKUP & IMPORT', icon: 'cloudDownloadOutline'),
                const SizedBox(height: 12),
                SettingsCard(
                  children: [
                    SettingsRow(
                      icon: 'exportVariant',
                      title: 'Export Backup ZIP',
                      subtitle: 'Plaintext ZIP with notes, circles, masteries, vlogs',
                      onTap: _backupBusy ? null : _openExport,
                    ),
                    const SettingsDivider(),
                    SettingsRow(
                      icon: 'import',
                      title: 'Import Backup',
                      subtitle: 'Wipes current data, restores the backup',
                      onTap: _backupBusy ? null : _openImport,
                    ),
                    if (_backupStatus != null) ...[
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.primaryAction,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            _backupStatus!,
                            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                CompressionStatusBar(),
                AiSettingsPanel(),
                DeveloperToolsPanel(),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _pickLockTimeout(int current) async {
    const options = [0, 1, 3, 5, 10, 30];
    final choice = await showActionSheet<int>(
      context,
      title: 'Inactivity Lock',
      selected: current,
      options: [
        for (final mins in options)
          ActionSheetOption(
            value: mins,
            label: mins == 0 ? 'Off' : '$mins minutes',
            icon: mins == 0 ? 'timerOffOutline' : 'timerOutline',
          ),
      ],
    );
    if (choice != null) {
      await ref.read(appDataProvider.notifier).setPreference(lockTimeoutMins: choice);
    }
  }

  Future<void> _pickVlogQuality(String current) async {
    final choice = await showActionSheet<String>(
      context,
      title: 'Vlog Quality',
      selected: current,
      options: [
        for (final quality in vlogQualityOptions)
          ActionSheetOption(
            value: quality,
            label: quality == '2160p' ? '$quality (4K)' : quality,
            icon: 'videoOutline',
          ),
      ],
    );
    if (choice != null) {
      await ref.read(appDataProvider.notifier).setPreference(vlogQuality: choice);
    }
  }

  Future<void> _pickCompressionPreset(String current) async {
    final choice = await showActionSheet<String>(
      context,
      title: 'Compression Preset',
      selected: current,
      options: const [
        ActionSheetOption(value: 'off', label: 'Off — keep original', icon: 'archiveOffOutline'),
        ActionSheetOption(value: 'light', label: 'Light (~40% smaller)', icon: 'archiveOutline'),
        ActionSheetOption(value: 'balanced', label: 'Balanced (~60% smaller)', icon: 'scaleBalance'),
        ActionSheetOption(value: 'max', label: 'Maximum (~80% smaller)', icon: 'archiveArrowDownOutline'),
      ],
    );
    if (choice != null) {
      await ref.read(appDataProvider.notifier).setPreference(compressionPreset: choice);
    }
  }

  void _openChangelog() {
    showBaseModal(
      context,
      title: 'What\'s New',
      heightFactor: 0.6,
      builder: (close) => const SingleChildScrollView(
        padding: EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _ChangelogRow('v1.3.0', 'AMOLED redesign · 7-day urgent check-in glow · Circles premium modal'),
            _ChangelogRow('v1.2.0', '60fps animations · virtualized lists'),
            _ChangelogRow('v1.1.0', 'Vlog recording + compression · auto-play feed'),
            _ChangelogRow('v1.0.0', 'Circles — relationship journaling'),
            _ChangelogRow('v0.9.0', 'Writing UX fixes · mobile overhaul'),
          ],
        ),
      ),
    );
  }

  static String _formatBytes(int bytes) {
    if (bytes < 1048576) return '${(bytes / 1024).round()} KB';
    if (bytes < 1073741824) return '${(bytes / 1048576).toStringAsFixed(1)} MB';
    return '${(bytes / 1073741824).toStringAsFixed(1)} GB';
  }
}

class _ChangelogRow extends StatelessWidget {
  const _ChangelogRow(this.version, this.text);

  final String version;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            version,
            style: const TextStyle(
              color: AppColors.primaryAction,
              fontSize: 13,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

/// Toggle row wired to a preference.
class _PrefToggleRow extends StatelessWidget {
  const _PrefToggleRow({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.value,
    required this.onChanged,
  });

  final String title;
  final String subtitle;
  final String icon;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
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
                Text(
                  subtitle,
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                ),
              ],
            ),
          ),
          SettingsToggle(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}

/// Horizontal font chip scroller (each chip renders in its own font).
class _FontPicker extends StatelessWidget {
  const _FontPicker({required this.prefs});

  final dynamic prefs;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: _fontLabels.length,
        itemBuilder: (context, index) {
          final active = prefs.fontIndex == index;
          final family = fontFamilyForIndex(index);
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 3),
            child: AnimatedScaleButton(
              onPress: () => ProviderScope.containerOf(context, listen: false)
                  .read(appDataProvider.notifier)
                  .setPreference(fontIndex: index),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: active ? AppColors.primaryAction : AppColors.glassSurfaceSubtle,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: active ? Colors.transparent : AppColors.glassBorderFaint,
                    width: 1,
                  ),
                ),
                child: Text(
                  _fontLabels[index],
                  style: TextStyle(
                    color: active ? AppColors.primaryActionText : AppColors.textSecondary,
                    fontSize: 12,
                    fontFamily: family,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Reading size segmented control (4 "A" buttons, SPEC §15).
class _ReadingSizePicker extends StatelessWidget {
  const _ReadingSizePicker({required this.prefs});

  final dynamic prefs;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          const Text(
            'Reading Size',
            style: TextStyle(color: AppColors.textPrimary, fontSize: 15, fontWeight: FontWeight.w600),
          ),
          const Spacer(),
          for (var i = 0; i < 4; i++)
            Padding(
              padding: const EdgeInsets.only(left: 6),
              child: AnimatedScaleButton(
                onPress: () => ProviderScope.containerOf(context, listen: false)
                    .read(appDataProvider.notifier)
                    .setPreference(sizeIndex: i),
                child: Container(
                  width: 36,
                  height: 36,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: prefs.sizeIndex == i
                        ? AppColors.primaryAction
                        : AppColors.glassSurfaceSubtle,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    'A',
                    style: TextStyle(
                      color: prefs.sizeIndex == i
                          ? AppColors.primaryActionText
                          : AppColors.textSecondary,
                      fontSize: const [12.0, 16.0, 20.0, 24.0][i],
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Live preview of the selected font + size.
class _LivePreview extends StatelessWidget {
  const _LivePreview({required this.prefs});

  final dynamic prefs;

  @override
  Widget build(BuildContext context) {
    final size = readingSizes[prefs.sizeIndex.clamp(0, 3)];
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceOverlayLight,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        'The quick brown fox jumps over the lazy dog.\nKeep typing — your words depend on it.',
        style: TextStyle(
          color: AppColors.textBody,
          fontSize: size.fontSize,
          height: size.lineHeight / size.fontSize,
          fontFamily: fontFamilyForIndex(prefs.fontIndex),
        ),
      ),
    );
  }
}
