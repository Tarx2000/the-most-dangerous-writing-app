/// Settings repository — the de-facto preference store (SPEC §7).
/// All app preferences live in the `settings` table as key/value pairs.
library;

import '../db.dart';

class SettingsRepository {
  Future<String?> getSetting(String key) async {
    final row = await getFirst('SELECT value FROM settings WHERE key = ?', [key]);
    final value = row?['value'];
    return value is String ? value : null;
  }

  /// Upsert with a fresh updated_at timestamp.
  Future<void> setSetting(String key, String value) async {
    await run(
      '''INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at''',
      [key, value, DateTime.now().millisecondsSinceEpoch],
    );
  }

  Future<void> deleteSetting(String key) async {
    await run('DELETE FROM settings WHERE key = ?', [key]);
  }

  Future<Map<String, String>> getAllSettings() async {
    final rows = await getAll('SELECT * FROM settings');
    return {
      for (final row in rows)
        if (row['key'] is String && row['value'] is String)
          row['key'] as String: row['value'] as String,
    };
  }

  Future<void> deleteAllSettings() async {
    await run('DELETE FROM settings');
  }
}
