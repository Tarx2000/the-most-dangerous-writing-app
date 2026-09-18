/// Security controller tests (SPEC §12) — PIN setup/verify, lockout,
/// tiers, auto-lock lifecycle.
library;

import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:local_auth/local_auth.dart';
import 'package:mda_flutter/data/services/secure_storage_service.dart';
import 'package:mda_flutter/domain/use_cases/security_controller.dart';

/// In-memory secure storage stand-in (subclassing the real service).
class _FakeStorage extends SecureStorageService {
  _FakeStorage() : super();

  final Map<String, String> values = {};

  @override
  Future<String?> readPin() async => values[SecureStorageService.pinKey];
  @override
  Future<void> writePin(String pin) async =>
      values[SecureStorageService.pinKey] = pin;
  @override
  Future<int> readAttemptCount() async =>
      int.tryParse(values[SecureStorageService.pinAttemptCountKey] ?? '') ?? 0;
  @override
  Future<void> writeAttemptCount(int count) async =>
      values[SecureStorageService.pinAttemptCountKey] = '$count';
  @override
  Future<int> readLockoutUntil() async =>
      int.tryParse(values[SecureStorageService.pinLockoutUntilKey] ?? '') ?? 0;
  @override
  Future<void> writeLockoutUntil(int ms) async =>
      values[SecureStorageService.pinLockoutUntilKey] = '$ms';
  @override
  Future<void> clearPinState() async => values.clear();
}

class _FakeAuth extends LocalAuthentication {
  List<BiometricType> enrolled = [BiometricType.fingerprint];
  bool result = true;
  bool? biometricOnlyRequested;
  int calls = 0;
  Object? error;
  Completer<bool>? pending;

  @override
  Future<bool> isDeviceSupported() async => true;

  @override
  Future<List<BiometricType>> getAvailableBiometrics() async => enrolled;

  @override
  Future<bool> authenticate({
    required String localizedReason,
    authMessages = const [],
    bool biometricOnly = false,
    bool sensitiveTransaction = true,
    bool persistAcrossBackgrounding = false,
  }) async {
    calls++;
    biometricOnlyRequested = biometricOnly;
    if (error != null) throw error!;
    return pending?.future ?? result;
  }
}

void main() {
  late _FakeStorage storage;
  late SecurityController controller;
  late _FakeAuth auth;

  setUp(() {
    storage = _FakeStorage();
    auth = _FakeAuth();
    controller = SecurityController(storage: storage, localAuth: auth);
  });

  tearDown(() {
    controller.dispose();
  });

  test('setup flow: create → confirm → verified', () async {
    final future = controller.requestPin();
    await Future<void>.delayed(Duration.zero);
    expect(controller.mode.value, PinPadMode.setup1);

    await controller.onDigit('1234');
    expect(controller.mode.value, PinPadMode.setup2);

    await controller.onDigit('1234');
    expect(await future, isTrue);
    expect(await storage.readPin(), '1234');
  });

  test('mismatched confirm restarts setup', () async {
    final future = controller.requestPin();
    await Future<void>.delayed(Duration.zero);
    await controller.onDigit('1234');
    await controller.onDigit('9999');
    expect(controller.mode.value, PinPadMode.setup1);
    expect(await storage.readPin(), isNull);
    // The pad stays open for retry — cancel completes the request.
    controller.cancel();
    expect(await future, isFalse);
  });

  test(
    'verify: wrong pin ×3 → lockout; correct pin succeeds after expiry',
    () async {
      await storage.writePin('1234');
      final future = controller.requestPin();
      await Future<void>.delayed(Duration.zero);
      expect(controller.mode.value, PinPadMode.verify);

      await controller.onDigit('0000');
      await controller.onDigit('0000');
      await controller.onDigit('0000');
      expect(await future, isFalse);
      expect(await storage.readLockoutUntil(), greaterThan(0));

      // New request during lockout → stays locked.
      final lockedFuture = controller.requestPin();
      await Future<void>.delayed(Duration.zero);
      expect(controller.isLockedOut.value, isTrue);
      expect(await lockedFuture, isFalse);

      // Lockout expires → verify works.
      await storage.writeLockoutUntil(0);
      await storage.writeAttemptCount(0);
      final okFuture = controller.requestPin();
      await Future<void>.delayed(Duration.zero);
      await controller.onDigit('1234');
      expect(await okFuture, isTrue);
    },
  );

  test('correct pin during verify succeeds immediately', () async {
    await storage.writePin('1234');
    final future = controller.requestPin();
    await Future<void>.delayed(Duration.zero);
    await controller.onDigit('1234');
    expect(await future, isTrue);
  });

  test('tiers: notes implies profile and circles; lockAll resets', () async {
    expect(controller.isNotesUnlocked, isFalse);
    await controller.unlockCircles();
    expect(controller.isCirclesUnlocked, isTrue);
    expect(controller.isNotesUnlocked, isFalse);

    await controller.unlockProfile();
    expect(controller.isProfileUnlocked, isTrue);
    expect(controller.isNotesUnlocked, isFalse);

    // Seed a PIN so the notes tier can be granted via PIN verify.
    await storage.writePin('1234');
    final unlocked = controller.unlockNotes(
      preferPinAuth: true,
      useBiometrics: true,
    );
    // unlockNotes → requestPin → _open is an async chain; flush it twice.
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
    await controller.onDigit('1234');
    expect(await unlocked, isTrue);
    expect(controller.isNotesUnlocked, isTrue);
    expect(controller.isProfileUnlocked, isTrue);
    expect(controller.isCirclesUnlocked, isTrue);

    controller.lockAll();
    expect(controller.isNotesUnlocked, isFalse);
    expect(controller.isCirclesUnlocked, isFalse);
  });

  test('tierVersion bumps on unlock and lock', () async {
    final v0 = controller.tierVersion.value;
    await controller.unlockCircles();
    expect(controller.tierVersion.value, v0 + 1);
    controller.lockAll();
    expect(controller.tierVersion.value, v0 + 2);
  });
  test(
    'biometric success permits native passcode and unlocks all tiers',
    () async {
      expect(
        await controller.unlockNotes(preferPinAuth: false, useBiometrics: true),
        isTrue,
      );
      expect(auth.calls, 1);
      expect(auth.biometricOnlyRequested, isFalse);
      expect(controller.isFeedUnlocked, isTrue);
      expect(controller.mode.value, isNull);
    },
  );

  test('biometric cancellation never opens a second PIN prompt', () async {
    auth.result = false;
    expect(
      await controller.unlockNotes(preferPinAuth: false, useBiometrics: true),
      isFalse,
    );
    expect(controller.mode.value, isNull);
    auth.error = const LocalAuthException(
      code: LocalAuthExceptionCode.userCanceled,
    );
    expect(
      await controller.unlockNotes(preferPinAuth: false, useBiometrics: true),
      isFalse,
    );
    expect(controller.isVisible.value, isFalse);
  });

  test('hardware without enrollment falls back to app PIN', () async {
    auth.enrolled = [];
    await storage.writePin('1234');
    final pending = controller.unlockNotes(
      preferPinAuth: false,
      useBiometrics: true,
    );
    await Future<void>.delayed(Duration.zero);
    expect(auth.calls, 0);
    expect(controller.mode.value, PinPadMode.verify);
    await controller.onDigit('1234');
    expect(await pending, isTrue);
  });

  test(
    'circles and profile require authentication and do not grant notes',
    () async {
      auth.result = false;
      expect(await controller.unlockCircles(), isFalse);
      expect(controller.isCirclesUnlocked, isFalse);
      auth.result = true;
      expect(await controller.unlockProfile(), isTrue);
      expect(controller.isCirclesUnlocked, isTrue);
      expect(controller.isProfileUnlocked, isTrue);
      expect(controller.isNotesUnlocked, isFalse);
    },
  );

  test('duplicate taps do not open overlapping biometric dialogs', () async {
    auth.pending = Completer<bool>();
    final first = controller.unlockNotes(
      preferPinAuth: false,
      useBiometrics: true,
    );
    await Future<void>.delayed(Duration.zero);
    expect(
      await controller.unlockNotes(preferPinAuth: false, useBiometrics: true),
      isFalse,
    );
    expect(auth.calls, 1);
    auth.pending!.complete(true);
    expect(await first, isTrue);
  });

  test(
    'native biometric lifecycle interruption does not invalidate unlock',
    () async {
      auth.pending = Completer<bool>();
      final pending = controller.unlockNotes(
        preferPinAuth: false,
        useBiometrics: true,
      );
      await Future<void>.delayed(Duration.zero);
      controller.onAppLifecycle(AppLifecycleState.inactive, lockTimeoutMins: 3);
      controller.onAppLifecycle(AppLifecycleState.paused, lockTimeoutMins: 0);
      controller.onAppLifecycle(AppLifecycleState.resumed, lockTimeoutMins: 3);
      auth.pending!.complete(true);
      expect(await pending, isTrue);
      controller.onAppLifecycle(AppLifecycleState.inactive, lockTimeoutMins: 3);
      expect(controller.isNotesUnlocked, isFalse);
    },
  );

  test('manual lock wins over a late successful fingerprint', () async {
    auth.pending = Completer<bool>();
    final pending = controller.unlockNotes(
      preferPinAuth: false,
      useBiometrics: true,
    );
    await Future<void>.delayed(Duration.zero);
    controller.lockAll();
    auth.pending!.complete(true);
    expect(await pending, isFalse);
    expect(controller.isNotesUnlocked, isFalse);
  });

  test(
    'PIN cancellation before storage read does not reopen the pad',
    () async {
      final pending = controller.requestPin();
      controller.cancel();
      await Future<void>.delayed(Duration.zero);
      expect(await pending, isFalse);
      expect(controller.mode.value, isNull);
      expect(controller.isVisible.value, isFalse);
    },
  );

  test('invalid PIN submissions never create malformed credentials', () async {
    final pending = controller.requestPin();
    await Future<void>.delayed(Duration.zero);
    await controller.onDigit('12345');
    await controller.onDigit('abcd');
    expect(controller.mode.value, PinPadMode.setup1);
    expect(await storage.readPin(), isNull);
    controller.cancel();
    expect(await pending, isFalse);
  });

  testWidgets('activity extends idle timeout and expiry relocks every tier', (
    tester,
  ) async {
    await controller.unlockNotes(
      preferPinAuth: false,
      useBiometrics: true,
      lockTimeoutMins: 1,
    );
    await tester.pump(const Duration(seconds: 50));
    controller.keepAlive(lockTimeoutMins: 1);
    await tester.pump(const Duration(seconds: 50));
    expect(controller.isNotesUnlocked, isTrue);
    await tester.pump(const Duration(seconds: 11));
    expect(controller.isNotesUnlocked, isFalse);
    expect(controller.isCirclesUnlocked, isFalse);
  });

  testWidgets('background grace cancels on return and locks after expiry', (
    tester,
  ) async {
    await controller.unlockNotes(preferPinAuth: false, useBiometrics: true);
    controller.onAppLifecycle(AppLifecycleState.paused, lockTimeoutMins: 3);
    await tester.pump(const Duration(seconds: 20));
    controller.onAppLifecycle(AppLifecycleState.resumed, lockTimeoutMins: 3);
    await tester.pump(const Duration(seconds: 20));
    expect(controller.isNotesUnlocked, isTrue);
    controller.onAppLifecycle(AppLifecycleState.paused, lockTimeoutMins: 3);
    await tester.pump(const Duration(seconds: 31));
    expect(controller.isNotesUnlocked, isFalse);
  });

  testWidgets('circles-only unlock ignores keepAlive (RN: timer is notes-only)', (
    tester,
  ) async {
    auth.result = true;
    final unlocked = await controller.unlockCircles(
      preferPinAuth: false,
      useBiometrics: true,
      lockTimeoutMins: 1,
    );
    expect(unlocked, isTrue);
    expect(controller.isCirclesUnlocked, isTrue);
    controller.keepAlive(lockTimeoutMins: 1);
    // No inactivity timer was started: advancing past the timeout changes
    // nothing; circles persist until background/manual lock (RN parity).
    await tester.pump(const Duration(minutes: 2));
    expect(controller.isCirclesUnlocked, isTrue);
    expect(controller.isNotesUnlocked, isFalse);
    controller.lockAll();
  });
}
