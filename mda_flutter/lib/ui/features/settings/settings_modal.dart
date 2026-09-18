/// SettingsModal — the full settings sheet (SPEC §15, port of `SettingsModal.tsx`).
/// Version chip · Appearance (fonts + reading size + preview) · Security &
/// Storage · Feed & System · Backup & Import · CompressionStatusBar ·
/// AI panel · Developer tools.
library;

import 'dart:io';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/config/app_config.dart';
import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/providers.dart';
import '../../../data/app_data.dart';
import 'backup_scope_picker.dart';
import '../../../data/security_providers.dart';
import '../../core/widgets/action_sheet.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/base_modal.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/settings_primitives.dart';
import 'ai_settings_panel.dart';
import 'compression_status_bar.dart';
import 'developer_tools_panel.dart';

const List<String> _fontLabels = fontLabels;

class SettingsModal extends ConsumerStatefulWidget {
  const SettingsModal({super.key, required this.onClose});

  final VoidCallback onClose;

  @override
  ConsumerState<SettingsModal> createState() => _SettingsModalState();
}

class _SettingsModalState extends ConsumerState<SettingsModal> {
  bool _backupBusy = false;
  String? _backupStatus;

  /// 0..1 restore progress (drives the progress bar during video copying).
  double _backupProgress = 0;

  Future<void> _openExport() async {
    if (_backupBusy) return;
    final scopes = await showDialog<List<String>>(
      context: context,
      barrierColor: AppColors.overlayMedium,
      builder: (_) => const BackupScopePicker(),
    );
    if (scopes == null || scopes.isEmpty || !mounted) return;
    vibrate(HapticPatterns.backupOp);
    setState(() {
      _backupBusy = true;
      _backupStatus = 'Creating backup ZIP...';
    });
    try {
      final result = await ref
          .read(appDataProvider.notifier)
          .exportBackupZip(scopes);
      if (!mounted) return;
      if (!result.success || result.zipPath == null) {
        _showBackupError(result.error ?? 'Backup failed');
        return;
      }
      setState(() => _backupStatus = 'Backup created — sharing...');
      await SharePlus.instance.share(
        ShareParams(files: [XFile(result.zipPath!)]),
      );
    } catch (_) {
      _showBackupError(
        'Could not create or share the backup. Please try again.',
      );
    } finally {
      if (mounted) {
        setState(() {
          _backupBusy = false;
          _backupStatus = null;
        });
      }
    }
  }

  void _showBackupError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.primaryAction,
      ),
    );
  }

  Future<void> _openImport() async {
    if (_backupBusy) return;
    // Picker/plugin failures must be handled too, before an archive is opened.
    try {
      await _pickAndImport();
    } catch (_) {
      _showBackupError('Could not open the backup file. Please try again.');
    }
  }

  Future<void> _pickAndImport() async {
    vibrate(HapticPatterns.backupOp);
    const typeGroup = XTypeGroup(
      label: 'ZIP',
      extensions: ['zip'],
      mimeTypes: [
        'application/zip',
        'application/x-zip-compressed',
        'application/octet-stream',
        'application/x-compressed',
        'multipart/x-zip',
      ],
    );
    final file = await openFile(acceptedTypeGroups: [typeGroup]);
    if (file == null) return;

    if (!file.name.toLowerCase().endsWith('.zip')) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a valid .zip backup file.'),
          backgroundColor: AppColors.primaryAction,
        ),
      );
      return;
    }

    if (!mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: true,
      barrierColor: AppColors.overlayDark,
      builder: (ctx) => ConfirmDialog(
        title: 'Restore Backup?',
        message:
            'This will replace your current notes, circles, and settings with the data in this backup archive. This action cannot be undone.',
        confirmLabel: 'Restore',
        cancelLabel: 'Cancel',
        destructive: true,
        onConfirm: () => Navigator.of(ctx).pop(true),
        onCancel: () => Navigator.of(ctx).pop(false),
      ),
    );
    if (confirmed != true || !mounted) return;

    final security = ref.read(securityControllerProvider);
    final prefs = ref.read(preferencesProvider);
    if (!security.isNotesUnlocked) {
      final ok = await security.unlockNotes(
        preferPinAuth: prefs.preferPinAuth,
        useBiometrics: prefs.useBiometrics,
      );
      if (!ok || !mounted) return;
    }

    setState(() {
      _backupBusy = true;
      _backupStatus = 'Reading backup archive…';
      _backupProgress = 0;
    });

    File? tempZipFile;
    try {
      String path = file.path;
      // On Android, openFile returns a content:// URI from the Storage Access Framework (SAF).
      // Standard POSIX file streams cannot open content:// paths directly.
      // Copy the picked file bytes to a local temporary cache file first (matching RN copyToCacheDirectory).
      if (path.startsWith('content://') || !path.startsWith('/')) {
        final tempDir = await getTemporaryDirectory();
        final tempPath = p.join(
          tempDir.path,
          'mda_backup_import_${DateTime.now().millisecondsSinceEpoch}.zip',
        );
        tempZipFile = File(tempPath);
        // Stream large video backups instead of allocating the whole ZIP in RAM.
        final sink = tempZipFile.openWrite();
        try {
          await sink.addStream(file.openRead());
        } finally {
          await sink.close();
        }
        path = tempPath;
      }

      // The service never throws — failures arrive as BackupResult with a
      // user-facing message. The outer catch is only a last-resort net so a
      // 1 GB+ restore can never kill the app without explanation again.
      final result = await ref
          .read(appDataProvider.notifier)
          .importBackupZip(
            path,
            onProgress: (progress) {
              if (mounted) setState(() => _backupProgress = progress);
            },
            onStage: (stage) {
              if (mounted) setState(() => _backupStatus = stage);
            },
          );

      if (!mounted) return;
      setState(() {
        _backupBusy = false;
        _backupStatus = null;
        _backupProgress = 0;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.success
                ? 'Backup restored: ${result.videosIncluded} videos, ${result.thumbnailsIncluded} thumbnails.'
                : (result.error ?? 'Import failed'),
          ),
          backgroundColor: result.success
              ? AppColors.green
              : AppColors.primaryAction,
          duration: Duration(seconds: result.success ? 4 : 8),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _backupBusy = false;
        _backupStatus = null;
        _backupProgress = 0;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'The backup could not be restored. Your current data was left untouched. ($e)',
          ),
          backgroundColor: AppColors.primaryAction,
          duration: const Duration(seconds: 8),
        ),
      );
    } finally {
      if (tempZipFile != null) {
        try {
          if (await tempZipFile.exists()) await tempZipFile.delete();
        } catch (_) {}
      }
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
              'Version $appVersion',
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
            padding: const EdgeInsets.only(bottom: 40),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // -- Appearance -------------------------------------------------
                SettingsCard(
                  children: [
                    const _CardHeading(
                      'Appearance',
                      'Customize your reading and writing typography',
                      icon: 'formatText',
                    ),
                    _FontPicker(prefs: prefs),
                    const SizedBox(height: 20),
                    const Divider(height: 1, color: AppColors.glassBorder),
                    const SizedBox(height: 18),
                    _ReadingSizePicker(prefs: prefs),
                  ],
                ),

                const Padding(
                  padding: EdgeInsets.only(left: 5, bottom: 12),
                  child: Text(
                    'Live Preview',
                    style: TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                _LivePreview(prefs: prefs),
                const SizedBox(height: 20),

                // -- Security & Storage -----------------------------------------
                SettingsCard(
                  children: [
                    const _CardHeading(
                      'Security & Storage',
                      'Notes and Circles are protected by biometric authentication (fingerprint / face).',
                      icon: 'shieldLockOutline',
                    ),
                    _PrefToggleRow(
                      title: 'Force PIN Auth',
                      subtitle: 'Always ask for PIN instead of Biometrics',
                      icon: 'dialpad',
                      value: prefs.preferPinAuth,
                      onChanged: (v) => ref
                          .read(appDataProvider.notifier)
                          .setPreference(preferPinAuth: v),
                    ),
                    const SettingsDivider(),
                    SettingsRow(
                      icon: 'timerLockOutline',
                      title: 'Inactivity Lock',
                      subtitle: 'Time before face/fingerprint needed',
                      value: prefs.lockTimeoutMins == 0
                          ? 'Immediate'
                          : '${prefs.lockTimeoutMins} Min${prefs.lockTimeoutMins != 1 ? 's' : ''}',
                      onTap: () => _pickLockTimeout(prefs.lockTimeoutMins),
                    ),
                    const SettingsDivider(),
                    SettingsRow(
                      icon: 'serverNetwork',
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
                      icon: 'zipBoxOutline',
                      title: 'Compression Preset',
                      subtitle: 'Balance size and quality after recording',
                      value: prefs.compressionPreset.toUpperCase(),
                      onTap: () =>
                          _pickCompressionPreset(prefs.compressionPreset),
                    ),
                  ],
                ),

                // -- Feed & System ----------------------------------------------
                SettingsCard(
                  children: [
                    const _CardHeading(
                      'Feed & System',
                      'System-wide configurations and behaviors',
                      icon: 'newspaperVariantOutline',
                    ),
                    _PrefToggleRow(
                      title: 'Haptic Feedback',
                      subtitle: 'Subtle vibrations on interaction',
                      icon: 'vibrate',
                      value: prefs.enableHaptics,
                      onChanged: (v) => ref
                          .read(appDataProvider.notifier)
                          .setPreference(enableHaptics: v),
                    ),
                    const SettingsDivider(),
                    _PrefToggleRow(
                      title: 'Auto-play Videos',
                      subtitle: 'Videos play muted when visible in the feed',
                      icon: 'playCircleOutline',
                      value: ref.watch(feedDataProvider).autoPlayFeedVideos,
                      onChanged: (v) => ref
                          .read(appDataProvider.notifier)
                          .toggleAutoPlayFeedVideos(v),
                    ),
                  ],
                ),

                // -- Backup & Import --------------------------------------------
                SettingsCard(
                  children: [
                    const _CardHeading(
                      'Backup & Import',
                      'Export your journal entries, settings, Masteries, and vlog videos, or restore a previous ZIP backup.',
                      icon: 'backupRestore',
                    ),
                    SettingsRow(
                      icon: 'export',
                      title: 'Export Backup ZIP',
                      subtitle:
                          'Plaintext ZIP with notes, circles, masteries, vlogs',
                      onTap: _backupBusy ? null : _openExport,
                    ),
                    const SettingsDivider(),
                    SettingsRow(
                      icon: 'import',
                      title: 'Import Backup ZIP',
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
                          Expanded(
                            child: Text(
                              _backupStatus!,
                              style: const TextStyle(
                                color: AppColors.textMuted,
                                fontSize: 12,
                              ),
                            ),
                          ),
                          Text(
                            '${(_backupProgress * 100).round()}%',
                            style: const TextStyle(
                              color: AppColors.textSecondary,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: _backupProgress.clamp(0.0, 1.0),
                          minHeight: 5,
                          backgroundColor: AppColors.glassSurface,
                          valueColor: const AlwaysStoppedAnimation(
                            AppColors.primaryAction,
                          ),
                        ),
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
    const options = [0, 1, 3, 5, 15];
    final choice = await showActionSheet<int>(
      context,
      title: 'Inactivity Lock',
      selected: current,
      options: [
        for (final mins in options)
          ActionSheetOption(
            value: mins,
            label: mins == 0
                ? 'Immediately'
                : '$mins ${mins == 1 ? 'Minute' : 'Minutes'}',
            icon: mins == 0 ? 'timerOffOutline' : 'timerOutline',
          ),
      ],
    );
    if (choice != null) {
      await ref
          .read(appDataProvider.notifier)
          .setPreference(lockTimeoutMins: choice);
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
      await ref
          .read(appDataProvider.notifier)
          .setPreference(vlogQuality: choice);
    }
  }

  Future<void> _pickCompressionPreset(String current) async {
    final choice = await showActionSheet<String>(
      context,
      title: 'Compression Preset',
      selected: current,
      options: const [
        ActionSheetOption(
          value: 'off',
          label: 'Off — keep original',
          icon: 'archiveOffOutline',
        ),
        ActionSheetOption(
          value: 'light',
          label: 'Light (~40% smaller)',
          icon: 'archiveOutline',
        ),
        ActionSheetOption(
          value: 'balanced',
          label: 'Balanced (~60% smaller)',
          icon: 'scaleBalance',
        ),
        ActionSheetOption(
          value: 'max',
          label: 'Maximum (~80% smaller)',
          icon: 'archiveArrowDownOutline',
        ),
      ],
    );
    if (choice != null) {
      await ref
          .read(appDataProvider.notifier)
          .setPreference(compressionPreset: choice);
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
            _ChangelogRow(
              'v1.3.0',
              'AMOLED redesign · 7-day urgent check-in glow · Circles premium modal',
            ),
            _ChangelogRow('v1.2.0', '60fps animations · virtualized lists'),
            _ChangelogRow(
              'v1.1.0',
              'Vlog recording + compression · auto-play feed',
            ),
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
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 13,
                height: 1.4,
              ),
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
    return SettingsRow(
      icon: icon,
      title: title,
      subtitle: subtitle,
      onTap: () => onChanged(!value),
      trailing: SettingsToggle(value: value, onChanged: onChanged),
    );
  }
}

/// Horizontal font chip scroller (each chip renders in its own font).
class _FontPicker extends StatelessWidget {
  const _FontPicker({required this.prefs});

  final PreferencesState prefs;

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
              onPress: () => ProviderScope.containerOf(
                context,
                listen: false,
              ).read(appDataProvider.notifier).setPreference(fontIndex: index),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: active
                      ? AppColors.primaryAction
                      : AppColors.glassSurfaceSubtle,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: active
                        ? Colors.transparent
                        : AppColors.glassBorderFaint,
                    width: 1,
                  ),
                ),
                child: Text(
                  _fontLabels[index],
                  style: TextStyle(
                    color: active
                        ? AppColors.primaryActionText
                        : AppColors.textSecondary,
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

  final PreferencesState prefs;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Reading Size',
          style: TextStyle(
            color: AppColors.textSecondary,
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: AppColors.glassSurfaceLow,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              for (var i = 0; i < readingSizes.length; i++)
                Expanded(
                  child: Semantics(
                    label: 'Reading size ${i + 1}',
                    selected: prefs.sizeIndex == i,
                    button: true,
                    child: AnimatedScaleButton(
                      activeScale: 0.98,
                      onPress: () {
                        vibrate(HapticPatterns.optionSelect);
                        ProviderScope.containerOf(context, listen: false)
                            .read(appDataProvider.notifier)
                            .setPreference(sizeIndex: i);
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        height: 56,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: prefs.sizeIndex == i
                              ? AppColors.primaryAction
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          'A',
                          style: TextStyle(
                            color: prefs.sizeIndex == i
                                ? AppColors.primaryActionText
                                : AppColors.textSecondary,
                            fontSize: 12.0 + i * 4,
                            fontWeight: prefs.sizeIndex == i
                                ? FontWeight.w700
                                : FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Live preview of the selected font + size.
class _LivePreview extends StatelessWidget {
  const _LivePreview({required this.prefs});

  final PreferencesState prefs;

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
        'The quick brown fox jumps over the lazy dog.',
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

/// RN card hierarchy: red icon, sentence-case heading and supporting copy.
class _CardHeading extends StatelessWidget {
  const _CardHeading(this.title, this.subtitle, {required this.icon});
  final String title;
  final String subtitle;
  final String icon;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Mdi.get(icon), color: AppColors.primaryAction, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 5),
        Text(
          subtitle,
          style: const TextStyle(
            color: AppColors.textMuted,
            fontSize: 13,
            height: 1.5,
          ),
        ),
      ],
    ),
  );
}
