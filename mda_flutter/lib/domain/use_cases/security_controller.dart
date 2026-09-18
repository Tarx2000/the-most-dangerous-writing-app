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

class SecurityController extends ChangeNotifier {
  SecurityController({
    required SecureStorageService storage,
    LocalAuthentication? localAuth,
  })
    // Public constructor keeps the storage dependency injectable in tests.
    // ignore: prefer_initializing_formals
    : _storage = storage,
       _localAuth = localAuth ?? LocalAuthentication();

  final SecureStorageService _storage;

  // -- PIN ------------------------------------------------------------------

  String? _pendingPin;
  Completer<bool>? _pendingCompleter;
  String? _promptOverride;
  bool _disposed = false;
  bool _submittingPin = false;

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

    await _open(completer);
    return completer.future;
  }

  Future<void> _open(Completer<bool> request) async {
    try {
      final hasPin = (await _storage.readPin()) != null;
      final locked = await _isLockedOut();
      // A canceled or replaced request must never reopen the pad later.
      if (_disposed || _pendingCompleter != request) return;
      if (locked) {
        _finish(false);
        await _startLockoutTimer();
        return;
      }
      _lockoutTimer?.cancel();
      isLockedOut.value = false;
      lockoutRemainingSeconds.value = 0;
      _pendingPin = null;
      mode.value = hasPin ? PinPadMode.verify : PinPadMode.setup1;
      isVisible.value = true;
      promptText.value = hasPin
          ? (_promptOverride ?? 'Enter your PIN')
          : 'Create a 4-Digit PIN';
      notifyListeners();
    } catch (_) {
      // A keystore error must leave the app locked, without an uncaught Future.
      if (!_disposed && _pendingCompleter == request) _finish(false);
    }
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

  Future<void> _startLockoutTimer() async {
    final until = await _storage.readLockoutUntil();
    if (_disposed || until <= 0) return;
    void update() {
      if (_disposed) return;
      final remaining = ((until - DateTime.now().millisecondsSinceEpoch) / 1000)
          .ceil();
      isLockedOut.value = remaining > 0;
      lockoutRemainingSeconds.value = remaining.clamp(
        0,
        pinLockoutDurationMs ~/ 1000,
      );
      if (remaining <= 0) _lockoutTimer?.cancel();
      // Expiry clears the banner; it must not create an orphan PIN request.
      notifyListeners();
    }

    _lockoutTimer?.cancel();
    update();
    _lockoutTimer = Timer.periodic(const Duration(seconds: 1), (_) => update());
  }

  /// Handles a digit press; returns true when the pin resolves.
  /// RN copy parity (`PinPadModal.tsx`): setup confirm = "Confirm PIN",
  /// mismatch = "PINs do not match. Try again." (not a reset to setup copy).
  Future<bool> onDigit(String digit) async {
    if (_disposed ||
        mode.value == null ||
        _submittingPin ||
        isLockedOut.value ||
        !RegExp(r'^\d{4}$').hasMatch(digit)) {
      return false;
    }
    _submittingPin = true;
    try {
      return await _submitPin(digit);
    } finally {
      _submittingPin = false;
    }
  }

  Future<bool> _submitPin(String digit) async {
    _promptOverride = null;

    switch (mode.value!) {
      case PinPadMode.setup1:
        _pendingPin = digit;
        mode.value = PinPadMode.setup2;
        promptText.value = 'Confirm PIN';
        notifyListeners();
        return false;
      case PinPadMode.setup2:
        if (digit == _pendingPin) {
          await _storage.writePin(digit);
          await _storage.writeAttemptCount(0);
          await _storage.writeLockoutUntil(0);
          if (_disposed || _pendingCompleter == null) return false;
          _finish(true);
          return true;
        } else {
          _shake();
          _pendingPin = null;
          mode.value = PinPadMode.setup1;
          promptText.value = 'PINs do not match. Try again.';
          notifyListeners();
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
        DateTime.now().millisecondsSinceEpoch + pinLockoutDurationMs,
      );
      _finish(false);
      await _startLockoutTimer();
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
    notifyListeners();
    final completer = _pendingCompleter;
    _pendingCompleter = null;
    if (completer != null && !completer.isCompleted) {
      completer.complete(success);
    }
  }

  void cancel() {
    _lockoutTimer?.cancel();
    isLockedOut.value = false;
    lockoutRemainingSeconds.value = 0;
    _pendingPin = null;
    _finish(false);
  }

  // -- Biometric tiers --------------------------------------------------------

  final LocalAuthentication _localAuth;

  /// Tier flags: full access includes profile and circles; profile includes circles.
  bool isCirclesUnlocked = false;
  bool isProfileUnlocked = false;
  bool isNotesUnlocked = false;
  bool isFeedUnlocked = false;
  bool _isAuthenticatingBiometrics = false;
  bool _unlockInProgress = false;
  int _lockGeneration = 0;
  DateTime? _backgroundedAt;
  final ValueNotifier<int> tierVersion = ValueNotifier(0);

  Future<bool> unlockNotes({
    required bool preferPinAuth,
    required bool useBiometrics,
    int lockTimeoutMins = 3,
  }) => _unlock(
    2,
    preferPinAuth: preferPinAuth,
    useBiometrics: useBiometrics,
    lockTimeoutMins: lockTimeoutMins,
  );

  Future<bool> unlockCircles({
    bool preferPinAuth = false,
    bool useBiometrics = true,
    int lockTimeoutMins = 3,
  }) => _unlock(
    1,
    preferPinAuth: preferPinAuth,
    useBiometrics: useBiometrics,
    lockTimeoutMins: lockTimeoutMins,
  );

  Future<bool> unlockProfile({
    bool preferPinAuth = false,
    bool useBiometrics = true,
    int lockTimeoutMins = 3,
  }) => _unlock(
    1.5,
    preferPinAuth: preferPinAuth,
    useBiometrics: useBiometrics,
    lockTimeoutMins: lockTimeoutMins,
  );

  Future<bool> _unlock(
    double tier, {
    required bool preferPinAuth,
    required bool useBiometrics,
    required int lockTimeoutMins,
  }) async {
    if (_disposed || _unlockInProgress) return false;
    if (isNotesUnlocked ||
        (tier == 1 && isCirclesUnlocked) ||
        (tier == 1.5 && isProfileUnlocked)) {
      return true;
    }
    _unlockInProgress = true;
    final generation = _lockGeneration;
    try {
      final reason = tier == 2
          ? 'Unlock your notes'
          : tier == 1.5
          ? 'Verify identity to view profile'
          : 'Confirm identity for Circles';
      final success = await _authenticate(
        reason,
        preferPinAuth: preferPinAuth,
        useBiometrics: useBiometrics,
      );
      // A manual lock or expired background grace wins over a late auth result.
      if (!success || _disposed || generation != _lockGeneration) return false;
      isCirclesUnlocked = true;
      if (tier >= 1.5) isProfileUnlocked = true;
      if (tier == 2) {
        isNotesUnlocked = true;
        isFeedUnlocked = true;
      }
      tierVersion.value++;
      // RN parity: the auto-lock countdown only runs for the full (Stage 2)
      // unlock — circles/profile-only unlocks persist until background or
      // manual lock. Starting it here would newly lock circles after N idle
      // minutes, which RN never does.
      if (tier == 2) _startInactivityTimer(lockTimeoutMins: lockTimeoutMins);
      notifyListeners();
      return true;
    } finally {
      _unlockInProgress = false;
    }
  }

  Future<bool> _authenticate(
    String reason, {
    required bool preferPinAuth,
    required bool useBiometrics,
  }) async {
    if (preferPinAuth || !useBiometrics) {
      return requestPin(promptMessage: reason);
    }
    try {
      final supported = await _localAuth.isDeviceSupported();
      final enrolled = supported
          ? await _localAuth.getAvailableBiometrics()
          : <BiometricType>[];
      if (_disposed) return false;
      if (enrolled.isEmpty) return requestPin(promptMessage: reason);
      _isAuthenticatingBiometrics = true;
      try {
        // Native passcode fallback is supported, matching Expo authentication.
        // Cancel remains cancel: never open another prompt after dismissal.
        return await _localAuth.authenticate(localizedReason: reason);
      } finally {
        _isAuthenticatingBiometrics = false;
      }
    } on LocalAuthException catch (error) {
      if (_disposed) return false;
      switch (error.code) {
        case LocalAuthExceptionCode.userCanceled:
        case LocalAuthExceptionCode.systemCanceled:
        case LocalAuthExceptionCode.timeout:
        case LocalAuthExceptionCode.authInProgress:
        case LocalAuthExceptionCode.uiUnavailable:
          return false;
        default:
          return requestPin(promptMessage: reason);
      }
    } catch (_) {
      return _disposed ? false : requestPin(promptMessage: reason);
    }
  }

  void lockAll() {
    _lockGeneration++;
    cancel();
    isCirclesUnlocked = false;
    isProfileUnlocked = false;
    isNotesUnlocked = false;
    isFeedUnlocked = false;
    tierVersion.value++;
    _inactivityTimer?.cancel();
    _inactivityTimer = null;
    _backgroundGraceTimer?.cancel();
    _backgroundGraceTimer = null;
    notifyListeners();
  }

  /// Resets the inactivity timer (activity events while fully unlocked).
  /// RN parity: the timer only runs for Stage 2 (`isNotesUnlocked`). Circles/
  /// profile-only unlocks persist until background/manual lock — `keepAlive`
  /// while only circles are open must not start a full-lock countdown.
  void keepAlive({int lockTimeoutMins = 3}) {
    if (isNotesUnlocked) {
      _startInactivityTimer(lockTimeoutMins: lockTimeoutMins);
    }
  }

  void _startInactivityTimer({int lockTimeoutMins = 3}) {
    _inactivityTimer?.cancel();
    if (lockTimeoutMins <= 0) return;
    _inactivityTimer = Timer(Duration(minutes: lockTimeoutMins), () {
      lockAll();
    });
  }

  /// App-state handling: background → grace timer; foreground → resume.
  /// RN parity: foreground only resumes the timer when Stage 2 is unlocked.
  void onAppLifecycle(AppLifecycleState state, {required int lockTimeoutMins}) {
    switch (state) {
      case AppLifecycleState.resumed:
        _backgroundGraceTimer?.cancel();
        _backgroundGraceTimer = null;
        final backgroundedAt = _backgroundedAt;
        _backgroundedAt = null;
        // Mobile timers may pause in the background; check elapsed wall time.
        if (backgroundedAt != null &&
            DateTime.now().difference(backgroundedAt) >=
                const Duration(seconds: 30)) {
          lockAll();
        } else if (isNotesUnlocked) {
          keepAlive(lockTimeoutMins: lockTimeoutMins);
        }
      case AppLifecycleState.inactive:
        // Do not auto-lock while the OS biometric sheet/dialog is actively displayed
        if (_isAuthenticatingBiometrics) break;
        // Control center / notification overlay → lock immediately (SPEC).
        lockAll();
      case AppLifecycleState.paused:
        if (_isAuthenticatingBiometrics) break;
        _backgroundedAt = DateTime.now();
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

  @override
  void dispose() {
    _disposed = true;
    final pending = _pendingCompleter;
    _pendingCompleter = null;
    if (pending != null && !pending.isCompleted) pending.complete(false);
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
    super.dispose();
  }
}
