/// Shared settings UI primitives (SPEC §15: glass cards, section headers,
/// toggle, rows) — used by every settings panel.
library;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/haptics.dart';
import '../../../core/theme/mdi.dart';
import 'animated_scale_button.dart';

/// Uppercase section label with the letter-spacing token (13/800/1.5).
class SettingsSectionHeader extends StatelessWidget {
  const SettingsSectionHeader(this.title, {super.key, this.icon});

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

/// Solid translucent settings card; nested actions retain their own touch surface.
class SettingsCard extends StatelessWidget {
  const SettingsCard({super.key, required this.children, this.active = false});

  final List<Widget> children;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      margin: const EdgeInsets.only(bottom: 20),
      decoration: BoxDecoration(
        color: AppColors.glassBackground,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: active ? AppColors.gold : AppColors.glassBorder,
          width: active ? 2 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children,
      ),
    );
  }
}

/// Hairline divider between card rows (RN parity: 1 px glassBorder line).
/// The old spacer-only version removed the visual row separation the RN
/// sheet has, making the sheet look flat and unfinished.
class SettingsDivider extends StatelessWidget {
  const SettingsDivider({super.key});

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        SizedBox(height: 10),
        Divider(height: 1, thickness: 1, color: AppColors.glassBorder),
        SizedBox(height: 10),
      ],
    );
  }
}

/// Tappable settings row (icon + title + subtitle + value/chevron).
class SettingsRow extends StatelessWidget {
  const SettingsRow({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.value,
    this.onTap,
    this.valueColor,
    this.trailing,
  });

  final String icon;
  final String title;
  final String? subtitle;
  final String? value;
  final VoidCallback? onTap;
  final Color? valueColor;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return AnimatedScaleButton(
      onPress: onTap == null
          ? null
          : () {
              vibrate(HapticPatterns.optionSelect);
              onTap!();
            },
      disabled: onTap == null,
      activeScale: 0.98,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.glassSurfaceMinimal,
          borderRadius: BorderRadius.circular(12),
        ),
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
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 11,
                        height: 1.4,
                      ),
                    ),
                ],
              ),
            ),
            if (value != null) ...[
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  value!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: valueColor ?? AppColors.primaryAction,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
            if (trailing != null) ...[const SizedBox(width: 10), trailing!],
            // RN parity: `chevron-down` 16 px in primaryAction red — the row
            // opens a picker below, it does not push a new screen.
            if (onTap != null && trailing == null) ...[
              const SizedBox(width: 4),
              Icon(
                Mdi.get('chevronDown'),
                color: AppColors.primaryAction,
                size: 16,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Custom toggle: 44×26 track, 22 px knob, red when on (SPEC §15).
class SettingsToggle extends StatelessWidget {
  const SettingsToggle({
    super.key,
    required this.value,
    required this.onChanged,
  });

  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      toggled: value,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () {
          vibrate(HapticPatterns.optionSelect);
          onChanged(!value);
        },
        child: SizedBox(
          width: 48,
          height: 48,
          child: Center(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 44,
              height: 26,
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                color: value ? AppColors.primaryAction : AppColors.border,
                borderRadius: BorderRadius.circular(13),
              ),
              child: AnimatedAlign(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOutCubic,
                alignment: value ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  width: 22,
                  height: 22,
                  decoration: const BoxDecoration(
                    color: AppColors.textPrimary,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
