/// Security controller — PIN + biometric tiers + auto-lock (SPEC §12).
/// Ports `usePinProvider.tsx` + `useSecurity.ts`:
///  - PIN: setup_1 → setup_2 → verify; 3 attempts → 30 s lockout
///  - Tiers: 0 locked → 1 circles → 1.5 profile → 2 notes (implies all)
///  - Auto-lock: lockTimeoutMins (0 = off), 30 s background grace,
///    immediate lock on Inactive
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show AppLifecycleState;
import 'package:local_auth/local_auth.dart';

import '../../core/config/app_config.dart';
import '../../data/services/secure_storage_service.dart';

enum PinPadMode { verify, setup1, setup2 }

class PinRequest {
  const PinRequest({this.promptMessage});

  final String? promptMessage;
}

class SecurityController {
  // ignore: prefer_initializing_formals — named param kept public-shaped.
  SecurityController({required SecureStorageService storage}) : _storage = storage;

  final SecureStorageService _storage;

  // -- PIN ------------------------------------------------------------------

  PinPadMode? _mode;
  String? _pendingPin;
  Completer<bool>? _pendingCompleter;
  String? _promptOverride;

  /// Live state for the PinPadModal UI.
  final ValueNotifier<PinPadMode?> mode = ValueNotifier(null);
  final ValueNotifier<bool> isVisible = ValueNotifier(false);
  final ValueNotifier<String?> promptText = ValueNotifier(null);
  final ValueNotifier<bool> isLockedOut = ValueNotifier(false);
  final ValueNotifier<int> lockoutRemainingSeconds = ValueNotifier(0);
  final ValueNotifier<String> shakeKey = ValueNotifier('');

  Timer? _lockoutTimer;
  Timer? _backgroundGraceTimer;
  Timer? _inactivityTimer;

  /// Promise-based PIN request (parity: overlapping requests reject the
  /// previous caller immediately).
  Future<bool> requestPin({String? promptMessage}) async {
    final previous = _pendingCompleter;
    if (previous != null && !previous.isCompleted) {
      previous.complete(false);
    }
    final completer = Completer<bool>();
    _pendingCompleter = completer;
    _promptOverride = promptMessage;

    await _open();
    return completer.future;
  }

  Future<void> _open() async {
    final hasPin = (await _storage.readPin()) != null;
    if (await _isLockedOut()) {
      // Locked out: reject the request immediately and show the banner.
      _finish(false);
      _startLockoutTimer();
      return;
    }
    _mode = hasPin ? PinPadMode.verify : PinPadMode.setup1;
    _pendingPin = null;
    mode.value = _mode;
    isVisible.value = true;
    promptText.value = _promptOverride ??
        (hasPin ? 'Enter your PIN' : 'Create a 4-Digit PIN');
  }

  Future<bool> _isLockedOut() async {
    final until = await _storage.readLockoutUntil();
    if (until <= 0) return false;
    if (until <= DateTime.now().millisecondsSinceEpoch) {
      await _storage.writeLockoutUntil(0);
      await _storage.writeAttemptCount(0);
      return false;
    }
    return true;
  }

  void _startLockoutTimer() {
    isLockedOut.value = true;
    _lockoutTimer?.cancel();
    _lockoutTimer = Timer.periodic(const Duration(seconds: 1), (timer) async {
      final until = await _storage.readLockoutUntil();
      final remaining = ((until - DateTime.now().millisecondsSinceEpoch) / 1000).ceil();
      if (remaining <= 0) {
        timer.cancel();
        isLockedOut.value = false;
        lockoutRemainingSeconds.value = 0;
        await _storage.writeLockoutUntil(0);
        await _storage.writeAttemptCount(0);
        unawaited(_open());
      } else {
        lockoutRemainingSeconds.value = remaining;
      }
    });
  }

  /// Handles a digit press; returns true when the pin resolves.
  Future<bool> onDigit(String digit) async {
    if (mode.value == null) return false;
    _promptOverride = null;

    switch (mode.value!) {
      case PinPadMode.setup1:
        _pendingPin = digit;
        mode.value = PinPadMode.setup2;
        promptText.value = 'Confirm your PIN';
        return false;
      case PinPadMode.setup2:
        if (digit == _pendingPin) {
          await _storage.writePin(digit);
          await _storage.writeAttemptCount(0);
          await _storage.writeLockoutUntil(0);
          _finish(true);
        } else {
          _shake();
          _pendingPin = null;
          mode.value = PinPadMode.setup1;
          promptText.value = 'Create a 4-Digit PIN';
        }
        return false;
      case PinPadMode.verify:
        return _verify(digit);
    }
  }

  Future<bool> _verify(String digit) async {
    final stored = await _storage.readPin();
    if (stored == digit) {
      await _storage.writeAttemptCount(0);
      await _storage.writeLockoutUntil(0);
      _finish(true);
      return true;
    }
    _shake();
    final attempts = await _storage.readAttemptCount() + 1;
    if (attempts >= pinMaxAttempts) {
      // 3 failures → 30 s lockout (SPEC §12).
      await _storage.writeAttemptCount(0);
      await _storage.writeLockoutUntil(
          DateTime.now().millisecondsSinceEpoch + pinLockoutDurationMs);
      _finish(false);
    } else {
      await _storage.writeAttemptCount(attempts);
    }
    return false;
  }

  void _shake() {
    shakeKey.value = DateTime.now().microsecondsSinceEpoch.toString();
  }

  void _finish(bool success) {
    isVisible.value = false;
    mode.value = null;
    promptText.value = null;
    final completer = _pendingCompleter;
    _pendingCompleter = null;
    if (completer != null && !completer.isCompleted) {
      completer.complete(success);
    }
  }

  void cancel() {
    _finish(false);
  }

  // -- Biometric tiers --------------------------------------------------------

  final LocalAuthentication _localAuth = LocalAuthentication();

  /// Tier flags (SPEC §12: 0 locked → 1 circles → 1.5 profile → 2 notes).
  bool isCirclesUnlocked = false;
  bool isProfileUnlocked = false;
  bool isNotesUnlocked = false;

  /// Bumped on every tier change so reactive widgets can re-evaluate.
  final ValueNotifier<int> tierVersion = ValueNotifier(0);

  /// Central unlock (Vision ★ button). Attempts biometrics, falls back to
  /// PIN per `preferPinAuth` / hardware availability (SPEC §12).
  Future<bool> unlockNotes({required bool preferPinAuth, required bool useBiometrics, int lockTimeoutMins = 3}) async {
    if (preferPinAuth || !useBiometrics) {
      return _unlockWithPin(lockTimeoutMins: lockTimeoutMins);
    }
    try {
      final available = await _localAuth.isDeviceSupported();
      final canCheck = await _localAuth.canCheckBiometrics;
      if (!available || !canCheck) {
        return _unlockWithPin(lockTimeoutMins: lockTimeoutMins);
      }
      final success = await _localAuth.authenticate(
        localizedReason: 'Unlock your writing app',
        biometricOnly: true,
      );
      if (success) {
        _grantAll(lockTimeoutMins: lockTimeoutMins);
        return true;
      }
      return _unlockWithPin(lockTimeoutMins: lockTimeoutMins);
    } catch (_) {
      return _unlockWithPin(lockTimeoutMins: lockTimeoutMins);
    }
  }

  Future<bool> _unlockWithPin({int lockTimeoutMins = 3}) async {
    final ok = await requestPin(promptMessage: 'Enter your PIN');
    if (ok) _grantAll(lockTimeoutMins: lockTimeoutMins);
    return ok;
  }

  void _grantAll({int lockTimeoutMins = 3}) {
    isCirclesUnlocked = true;
    isProfileUnlocked = true;
    isNotesUnlocked = true;
    tierVersion.value++;
    _startInactivityTimer(lockTimeoutMins: lockTimeoutMins);
  }

  /// Tiers (SPEC §12): notes implies everything; profile implies circles.
  void unlockCircles() {
    isCirclesUnlocked = true;
    tierVersion.value++;
  }

  void unlockProfile() {
    isCirclesUnlocked = true;
    isProfileUnlocked = true;
    tierVersion.value++;
  }

  void lockAll() {
    isCirclesUnlocked = false;
    isProfileUnlocked = false;
    isNotesUnlocked = false;
    tierVersion.value++;
    _inactivityTimer?.cancel();
    _inactivityTimer = null;
    _backgroundGraceTimer?.cancel();
    _backgroundGraceTimer = null;
  }

  /// Resets the inactivity timer (activity events while unlocked).
  void keepAlive({int lockTimeoutMins = 3}) {
    if (isNotesUnlocked) _startInactivityTimer(lockTimeoutMins: lockTimeoutMins);
  }

  void _startInactivityTimer({int lockTimeoutMins = 3}) {
    _inactivityTimer?.cancel();
    if (lockTimeoutMins <= 0) return;
    _inactivityTimer = Timer(Duration(minutes: lockTimeoutMins), () {
      lockAll();
    });
  }

  /// App-state handling: background → grace timer; foreground → resume.
  void onAppLifecycle(AppLifecycleState state, {required int lockTimeoutMins}) {
    switch (state) {
      case AppLifecycleState.resumed:
        _backgroundGraceTimer?.cancel();
        _backgroundGraceTimer = null;
        if (isNotesUnlocked) keepAlive(lockTimeoutMins: lockTimeoutMins);
      case AppLifecycleState.inactive:
        // Control center / notification overlay → lock immediately (SPEC).
        lockAll();
      case AppLifecycleState.paused:
        if (lockTimeoutMins == 0) {
          lockAll(); // Immediate when the inactivity timer is disabled
        } else {
          // 30 s background grace (SPEC §12) — then lock.
          _backgroundGraceTimer?.cancel();
          _backgroundGraceTimer = Timer(const Duration(seconds: 30), () {
            lockAll();
          });
        }
      case AppLifecycleState.detached:
      case AppLifecycleState.hidden:
        break;
    }
  }

  void dispose() {
    _lockoutTimer?.cancel();
    _inactivityTimer?.cancel();
    _backgroundGraceTimer?.cancel();
    mode.dispose();
    isVisible.dispose();
    promptText.dispose();
    isLockedOut.dispose();
    lockoutRemainingSeconds.dispose();
    shakeKey.dispose();
    tierVersion.dispose();
  }
}
