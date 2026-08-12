/// Security controller tests (SPEC §12) — PIN setup/verify, lockout,
/// tiers, auto-lock lifecycle.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/services/secure_storage_service.dart';
import 'package:mda_flutter/domain/use_cases/security_controller.dart';

/// In-memory secure storage stand-in (subclassing the real service).
class _FakeStorage extends SecureStorageService {
  _FakeStorage() : super();

  final Map<String, String> values = {};

  @override
  Future<String?> readPin() async => values[SecureStorageService.pinKey];
  @override
  Future<void> writePin(String pin) async => values[SecureStorageService.pinKey] = pin;
  @override
  Future<int> readAttemptCount() async => int.tryParse(values[SecureStorageService.pinAttemptCountKey] ?? '') ?? 0;
  @override
  Future<void> writeAttemptCount(int count) async =>
      values[SecureStorageService.pinAttemptCountKey] = '$count';
  @override
  Future<int> readLockoutUntil() async => int.tryParse(values[SecureStorageService.pinLockoutUntilKey] ?? '') ?? 0;
  @override
  Future<void> writeLockoutUntil(int ms) async => values[SecureStorageService.pinLockoutUntilKey] = '$ms';
  @override
  Future<void> clearPinState() async => values.clear();
}

void main() {
  late _FakeStorage storage;
  late SecurityController controller;

  setUp(() {
    storage = _FakeStorage();
    controller = SecurityController(storage: storage);
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

  test('verify: wrong pin ×3 → lockout; correct pin succeeds after expiry',
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
  });

  test('correct pin during verify succeeds immediately', () async {
    await storage.writePin('1234');
    final future = controller.requestPin();
    await Future<void>.delayed(Duration.zero);
    await controller.onDigit('1234');
    expect(await future, isTrue);
  });

  test('tiers: notes implies profile and circles; lockAll resets', () async {
    expect(controller.isNotesUnlocked, isFalse);
    controller.unlockCircles();
    expect(controller.isCirclesUnlocked, isTrue);
    expect(controller.isNotesUnlocked, isFalse);

    controller.unlockProfile();
    expect(controller.isProfileUnlocked, isTrue);
    expect(controller.isNotesUnlocked, isFalse);

    // Seed a PIN so the notes tier can be granted via PIN verify.
    await storage.writePin('1234');
    final unlocked = controller.unlockNotes(preferPinAuth: true, useBiometrics: true);
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

  test('tierVersion bumps on unlock and lock', () {
    final v0 = controller.tierVersion.value;
    controller.unlockCircles();
    expect(controller.tierVersion.value, v0 + 1);
    controller.lockAll();
    expect(controller.tierVersion.value, v0 + 2);
  });
}
