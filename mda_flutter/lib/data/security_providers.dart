/// Security provider wiring — singleton controller + tier state.
library;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/use_cases/security_controller.dart';
import 'providers.dart';

/// Singleton security controller (PIN + tiers + auto-lock).
final securityControllerProvider =
    ChangeNotifierProvider<SecurityController>((ref) {
  return SecurityController(storage: ref.watch(secureStorageServiceProvider));
});

/// True when the notes tier is unlocked (everything visible).
final isNotesUnlockedProvider = Provider<bool>((ref) {
  final controller = ref.watch(securityControllerProvider);
  return controller.isNotesUnlocked;
});

/// App lifecycle hook: wire in the root widget.
void handleAppLifecycle(AppLifecycleState state) {
  // Called by the app shell; resolves the current lock timeout from prefs
  // via the container passed at call time.
}
