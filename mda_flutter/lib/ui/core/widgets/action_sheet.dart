/// ActionSheet — option picker sheet (port of `ActionSheet.tsx`, SPEC §15).
/// Rows: MDI icon 22 + label 16/500 + check (20, primaryAction) when active;
/// active row bg `dangerTint`, active label primaryAction/700; rows are
/// AnimatedScaleButtons (press vibrate 10); title 18/700.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import 'animated_scale_button.dart';
import 'base_modal.dart';

class ActionSheetOption<T> {
  const ActionSheetOption({
    required this.value,
    required this.label,
    this.icon,
    this.favorite = false,
  });

  final T value;
  final String label;
  final String? icon;
  final bool favorite;
}

/// Shows the option sheet over the current route; resolves with the chosen
/// value (or null when dismissed).
Future<T?> showActionSheet<T>(
  BuildContext context, {
  required String title,
  required List<ActionSheetOption<T>> options,
  required T selected,
  String? selectedLabel,
}) {
  final completer = Completer<T?>();
  showBaseModal(
    context,
    title: title,
    heightFactor: 0.6,
    builder: (close) => _ActionSheetBody<T>(
      options: options,
      selected: selected,
      onSelect: (value) {
        vibrate(HapticPatterns.optionSelect);
        close();
        completer.complete(value);
      },
    ),
  ).then((_) {
    if (!completer.isCompleted) completer.complete(null);
  });
  return completer.future;
}

class _ActionSheetBody<T> extends StatelessWidget {
  const _ActionSheetBody({
    required this.options,
    required this.selected,
    required this.onSelect,
  });

  final List<ActionSheetOption<T>> options;
  final T selected;
  final ValueChanged<T> onSelect;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: options.length,
      itemBuilder: (context, index) {
        final option = options[index];
        final active = option.value == selected;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: AnimatedScaleButton(
            onPress: () => onSelect(option.value),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
              decoration: BoxDecoration(
                color: active ? AppColors.dangerTint : Colors.transparent,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                children: [
                  if (option.icon != null) ...[
                    Icon(
                      Mdi.get(option.icon!),
                      size: 22,
                      color: active ? AppColors.primaryAction : AppColors.textSecondary,
                    ),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    child: Text(
                      option.label,
                      style: TextStyle(
                        color: active ? AppColors.primaryAction : AppColors.textPrimary,
                        fontSize: 16,
                        fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                      ),
                    ),
                  ),
                  Icon(
                    active ? Mdi.get('check') : Mdi.get('chevronRight'),
                    size: 20,
                    color: active ? AppColors.primaryAction : AppColors.textMuted,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
