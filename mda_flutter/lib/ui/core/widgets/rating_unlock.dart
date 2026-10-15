import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../data/providers.dart';
import '../../../data/security_providers.dart';

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
            child: Center(
              child: FilledButton.icon(
                icon: const Icon(Icons.lock_outline_rounded),
                label: Text(title),
                onPressed: () async {
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
          ),
        ],
      ),
    ),
  );
}
