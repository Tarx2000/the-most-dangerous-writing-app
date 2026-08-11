/// Secure storage service — PIN + attempt counters live in Keychain/Keystore
/// (never in backups; `allowBackup=false` on Android enforces this too).
/// Behavior contract: same keys as the RN app (SPEC §7, secrets never exported).
library;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorageService {
  SecureStorageService({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const pinKey = '@mda_security_pin';
  static const pinAttemptCountKey = '@mda_pin_attempt_count';
  static const pinLockoutUntilKey = '@mda_pin_lockout_until';

  Future<String?> readPin() => _storage.read(key: pinKey);

  Future<void> writePin(String pin) => _storage.write(key: pinKey, value: pin);

  Future<int> readAttemptCount() async {
    final raw = await _storage.read(key: pinAttemptCountKey);
    return int.tryParse(raw ?? '') ?? 0;
  }

  Future<void> writeAttemptCount(int count) =>
      _storage.write(key: pinAttemptCountKey, value: '$count');

  /// Lockout expiry in ms since epoch (0 = no lockout).
  Future<int> readLockoutUntil() async {
    final raw = await _storage.read(key: pinLockoutUntilKey);
    return int.tryParse(raw ?? '') ?? 0;
  }

  Future<void> writeLockoutUntil(int ms) =>
      _storage.write(key: pinLockoutUntilKey, value: '$ms');

  /// Clears all security-related keys (successful verify / PIN change).
  Future<void> clearPinState() async {
    await _storage.delete(key: pinKey);
    await _storage.delete(key: pinAttemptCountKey);
    await _storage.delete(key: pinLockoutUntilKey);
  }
}
