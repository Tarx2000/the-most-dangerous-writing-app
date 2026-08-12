/// Secure storage service — PIN + attempt counters live in Keychain/Keystore
/// (never in backups; `allowBackup=false` on Android enforces this too).
/// Behavior contract: same keys as the RN app (SPEC §7, secrets never exported).
library;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorageService {
  // ignore: prefer_initializing_formals — nullable-with-lazy-default pattern.
  SecureStorageService({FlutterSecureStorage? storage}) : _storage = storage;

  FlutterSecureStorage? _storage;

  /// Lazy default so tests can subclass without touching the plugin.
  FlutterSecureStorage get _effective =>
      _storage ??= const FlutterSecureStorage();

  static const pinKey = '@mda_security_pin';
  static const pinAttemptCountKey = '@mda_pin_attempt_count';
  static const pinLockoutUntilKey = '@mda_pin_lockout_until';

  Future<String?> readPin() => _effective.read(key: pinKey);

  Future<void> writePin(String pin) => _effective.write(key: pinKey, value: pin);

  Future<int> readAttemptCount() async {
    final raw = await _effective.read(key: pinAttemptCountKey);
    return int.tryParse(raw ?? '') ?? 0;
  }

  Future<void> writeAttemptCount(int count) =>
      _effective.write(key: pinAttemptCountKey, value: '$count');

  /// Lockout expiry in ms since epoch (0 = no lockout).
  Future<int> readLockoutUntil() async {
    final raw = await _effective.read(key: pinLockoutUntilKey);
    return int.tryParse(raw ?? '') ?? 0;
  }

  Future<void> writeLockoutUntil(int ms) =>
      _effective.write(key: pinLockoutUntilKey, value: '$ms');

  /// Clears all security-related keys (successful verify / PIN change).
  Future<void> clearPinState() async {
    await _effective.delete(key: pinKey);
    await _effective.delete(key: pinAttemptCountKey);
    await _effective.delete(key: pinLockoutUntilKey);
  }
}
