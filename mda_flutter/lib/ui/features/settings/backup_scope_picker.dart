/// Select multiple backup categories, matching the RN default of a full backup.
/// Secrets are deliberately absent; the backup service also enforces this rule.
library;

import 'package:flutter/material.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../data/services/backup_service.dart';

const _scopeDescriptions = {
  'settings': (
    'Settings',
    'Appearance, preferences, and AI configuration (without keys)',
  ),
  'notes': (
    'Notes & Circles',
    'Journal entries, relationships, comments, and bookmarks',
  ),
  'masteries': ('Masteries', 'Masteries, check-ins, and alignment history'),
  'vlogs': ('Vlogs', 'Recorded videos and their metadata'),
};

class BackupScopePicker extends StatefulWidget {
  const BackupScopePicker({super.key});

  @override
  State<BackupScopePicker> createState() => _BackupScopePickerState();
}

class _BackupScopePickerState extends State<BackupScopePicker> {
  final Set<String> _selected = {...backupScopes};

  @override
  Widget build(BuildContext context) => AlertDialog(
    backgroundColor: AppColors.surfaceDark,
    surfaceTintColor: Colors.transparent,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(20),
      side: const BorderSide(color: AppColors.glassBorder),
    ),
    title: const Text(
      'Backup Contents',
      style: TextStyle(
        color: AppColors.textPrimary,
        fontSize: 18,
        fontWeight: FontWeight.w700,
      ),
    ),
    content: SizedBox(
      width: 420,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Select what to include. PIN & API keys are never exported.',
              style: TextStyle(
                color: AppColors.textMuted,
                fontSize: 13,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 16),
            for (final scope in backupScopes)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: CheckboxListTile(
                  key: ValueKey('backup-scope-$scope'),
                  value: _selected.contains(scope),
                  onChanged: (selected) {
                    vibrate(HapticPatterns.optionSelect);
                    setState(() {
                      selected == true
                          ? _selected.add(scope)
                          : _selected.remove(scope);
                    });
                  },
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  tileColor: AppColors.glassSurfaceMinimal,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  activeColor: AppColors.primaryAction,
                  title: Text(
                    _scopeDescriptions[scope]!.$1,
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  subtitle: Text(
                    _scopeDescriptions[scope]!.$2,
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 11,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text(
          'Cancel',
          style: TextStyle(color: AppColors.textSecondary),
        ),
      ),
      FilledButton(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primaryAction,
          foregroundColor: AppColors.primaryActionText,
        ),
        onPressed: _selected.isEmpty
            ? null
            : () => Navigator.of(
                context,
              ).pop(backupScopes.where(_selected.contains).toList()),
        child: Text('Export (${_selected.length})'),
      ),
    ],
  );
}
