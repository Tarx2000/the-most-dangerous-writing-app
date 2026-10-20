import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/providers.dart';
import '../../../data/security_providers.dart';
import 'animated_scale_button.dart';

/// Shared Obsidian & Liquid Glass authentication gate card used across Library,
/// Masteries, Circle Picker, and Check-in Rating Unlock so all locked views
/// share one unified visual language.
class VaultLockCard extends StatelessWidget {
  const VaultLockCard({
    super.key,
    required this.title,
    this.subtitle,
    required this.buttonLabel,
    required this.onUnlock,
    this.compact = false,
  });

  final String title;
  final String? subtitle;
  final String buttonLabel;
  final VoidCallback onUnlock;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      width: double.infinity,
      margin: EdgeInsets.symmetric(
        horizontal: compact ? 16 : 24,
        vertical: compact ? 16 : 24,
      ),
      padding: EdgeInsets.symmetric(
        horizontal: 24,
        vertical: compact ? 24 : 32,
      ),
      decoration: BoxDecoration(
        color: AppColors.glassBackground,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.glassBorder),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.dangerTint,
              border: Border.all(color: AppColors.dangerBorder),
            ),
            child: Icon(
              Mdi.get('lockOutline'),
              color: AppColors.primaryAction,
              size: 26,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 20,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.4,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 8),
            Text(
              subtitle!,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 13,
                height: 1.5,
              ),
            ),
          ],
          const SizedBox(height: 24),
          Flexible(
            child: AnimatedScaleButton(
              onPress: onUnlock,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 28,
                  vertical: 14,
                ),
                decoration: BoxDecoration(
                  color: AppColors.primaryAction,
                  borderRadius: BorderRadius.circular(100),
                  boxShadow: const [
                    BoxShadow(
                      color: AppColors.bloodGlow,
                      blurRadius: 12,
                      offset: Offset(0, 6),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Mdi.get('fingerprint'),
                      color: AppColors.textPrimary,
                      size: 18,
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        buttonLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: AppColors.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );

    if (compact) return card;
    return Center(child: SingleChildScrollView(child: card));
  }
}

/// Existing ratings and personal goals use the same notes authentication tier
/// as their Library history. New, unsaved life ratings remain freely writable.
class RatingUnlock extends ConsumerWidget {
  const RatingUnlock({super.key, required this.title});
  final String title;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    backgroundColor: AppColors.background,
    body: SafeArea(
      child: Column(
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              tooltip: 'Back',
              onPressed: () => context.pop(),
              icon: const Icon(Icons.arrow_back_rounded),
            ),
          ),
          Expanded(
            child: VaultLockCard(
              title: 'Protected Check-in',
              subtitle:
                  'Your saved ratings and reflections are protected by your PIN or biometrics.',
              buttonLabel: title,
              onUnlock: () async {
                final prefs = ref.read(preferencesProvider);
                await ref
                    .read(securityControllerProvider)
                    .unlockNotes(
                      preferPinAuth: prefs.preferPinAuth,
                      useBiometrics: prefs.useBiometrics,
                      lockTimeoutMins: prefs.lockTimeoutMins,
                    );
              },
            ),
          ),
        ],
      ),
    ),
  );
}
