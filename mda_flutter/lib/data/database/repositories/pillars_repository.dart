/// Masteries (pillars) repository — port of `src/lib/repositories/pillarsRepository.ts`.
/// Covers pillars, advice cards, pillar logs and pillar versions.
library;

import 'dart:convert';

import '../../../core/rating_day.dart';
import '../../models/pillar.dart';
import '../db.dart';

class PillarsRepository {
  // -- Pillars -------------------------------------------------------------

  Future<List<Pillar>> getAllPillars() async {
    final rows = await getAll('SELECT * FROM pillars ORDER BY created_at DESC');
    return rows.map(Pillar.fromRow).whereType<Pillar>().toList();
  }

  Future<Pillar?> getPillarById(String id) async {
    final row = await getFirst('SELECT * FROM pillars WHERE id = ?', [id]);
    return row == null ? null : Pillar.fromRow(row);
  }

  Future<void> insertPillar(Pillar pillar) async {
    final row = pillar.toRow();
    final columns = row.keys.join(', ');
    final placeholders = List.filled(row.length, '?').join(', ');
    await run(
      'INSERT INTO pillars ($columns) VALUES ($placeholders)',
      row.values.toList(),
    );
  }

  static const _allowedColumns = {
    'title',
    'type',
    'scope',
    'adaptive_days',
    'is_active',
    'description',
    'last_edited_at',
    'version',
    'reactivated_at',
  };

  Future<void> updatePillar(String id, Map<String, Object?> updates) async {
    final sets = <String>[];
    final values = <Object?>[];
    for (final entry in updates.entries) {
      if (!_allowedColumns.contains(entry.key)) continue;
      sets.add('${entry.key} = ?');
      values.add(entry.value);
    }
    if (sets.isEmpty) return;
    values.add(id);
    await run('UPDATE pillars SET ${sets.join(', ')} WHERE id = ?', values);
  }

  /// Soft delete (keeps history, hides the mastery).
  Future<void> deactivatePillar(String id) async {
    await run('UPDATE pillars SET is_active = 0 WHERE id = ?', [id]);
  }

  /// Full delete cascade (pillar + logs + versions).
  Future<void> hardDeletePillar(String id) async {
    await run('DELETE FROM pillars WHERE id = ?', [id]);
    await run('DELETE FROM pillar_logs WHERE pillar_id = ?', [id]);
    await run('DELETE FROM pillar_versions WHERE pillar_id = ?', [id]);
  }

  /// Timestamp of the most recent check-in (3-hour rate limit).
  Future<int?> getLatestPillarLogTimestamp() async {
    final row = await getFirst(
      'SELECT MAX(timestamp) AS max_ts FROM pillar_logs',
    );
    final value = row?['max_ts'];
    return value is int ? value : (value is num ? value.toInt() : null);
  }

  // -- Advice cards --------------------------------------------------------

  /// Active advice cards, newest first.
  Future<List<AdviceCard>> getAllAdviceCards() async {
    final rows = await getAll(
      'SELECT * FROM advice_cards WHERE is_active = 1 ORDER BY created_at DESC',
    );
    return rows.map(AdviceCard.fromRow).whereType<AdviceCard>().toList();
  }

  Future<AdviceCard?> getAdviceById(String id) async {
    final row = await getFirst('SELECT * FROM advice_cards WHERE id = ?', [id]);
    return row == null ? null : AdviceCard.fromRow(row);
  }

  Future<void> insertAdviceCard(AdviceCard card) async {
    final row = card.toRow();
    final columns = row.keys.join(', ');
    final placeholders = List.filled(row.length, '?').join(', ');
    await run(
      'INSERT INTO advice_cards ($columns) VALUES ($placeholders)',
      row.values.toList(),
    );
  }

  static const _adviceAllowed = {
    'text',
    'last_reflected_at',
    'reflection_count',
    'is_active',
  };

  Future<void> updateAdviceCard(String id, Map<String, Object?> updates) async {
    final sets = <String>[];
    final values = <Object?>[];
    for (final entry in updates.entries) {
      if (!_adviceAllowed.contains(entry.key)) continue;
      sets.add('${entry.key} = ?');
      values.add(entry.value);
    }
    if (sets.isEmpty) return;
    values.add(id);
    await run(
      'UPDATE advice_cards SET ${sets.join(', ')} WHERE id = ?',
      values,
    );
  }

  Future<void> deactivateAdviceCard(String id) async {
    await run('UPDATE advice_cards SET is_active = 0 WHERE id = ?', [id]);
  }

  Future<void> incrementAdviceReflection(String id, int timestamp) async {
    await run(
      'UPDATE advice_cards SET last_reflected_at = ?, reflection_count = reflection_count + 1 WHERE id = ?',
      [timestamp, id],
    );
  }

  // -- Pillar logs ---------------------------------------------------------

  /// Chronological logs for one mastery.
  Future<List<PillarLog>> getPillarLogs(String pillarId) async {
    final rows = await getAll(
      'SELECT * FROM pillar_logs WHERE pillar_id = ? ORDER BY timestamp ASC',
      [pillarId],
    );
    return rows.map(PillarLog.fromRow).whereType<PillarLog>().toList();
  }

  Future<void> insertPillarLog(PillarLog log) async {
    final row = log.toRow();
    final columns = row.keys.join(', ');
    final placeholders = List.filled(row.length, '?').join(', ');
    await run(
      'INSERT INTO pillar_logs ($columns) VALUES ($placeholders)',
      row.values.toList(),
    );
  }

  Future<List<PillarLog>> getAllLogs() async => (await getAll(
    'SELECT * FROM pillar_logs ORDER BY timestamp ASC',
  )).map(PillarLog.fromRow).whereType<PillarLog>().toList();

  /// Repeated current-day ratings update the same row, preserving reflection
  /// links. No public mutation path accepts a past day.
  Future<PillarLog> saveCurrentLog(PillarLog log, {DateTime? now}) async {
    final instant = now ?? DateTime.now();
    final day = RatingDay.at(instant);
    if (RatingDay.at(DateTime.fromMillisecondsSinceEpoch(log.timestamp)).key !=
            day.key ||
        (log.dayKey != null && log.dayKey != day.key)) {
      throw StateError('This rating day is closed at 03:00.');
    }
    final existing = await getFirst(
      'SELECT * FROM pillar_logs WHERE pillar_id = ? AND '
      '(day_key = ? OR (day_key IS NULL AND timestamp >= ? AND timestamp < ?)) '
      'ORDER BY timestamp DESC LIMIT 1',
      [
        log.pillarId,
        day.key,
        day.start.millisecondsSinceEpoch,
        day.end.millisecondsSinceEpoch,
      ],
    );
    final saved = PillarLog(
      id: existing?['id'] as String? ?? log.id,
      pillarId: log.pillarId,
      valueNum: log.valueNum,
      valueStr: log.valueStr,
      timestamp: log.timestamp,
      noteId: log.noteId ?? existing?['note_id'] as String?,
      dayKey: day.key,
    );
    final row = saved.toRow();
    await run(
      'INSERT INTO pillar_logs (${row.keys.join(', ')}) '
      'VALUES (${List.filled(row.length, '?').join(', ')}) '
      'ON CONFLICT(id) DO UPDATE SET value_num=excluded.value_num, '
      'value_str=excluded.value_str, timestamp=excluded.timestamp, '
      'day_key=excluded.day_key, note_id=excluded.note_id',
      row.values.toList(),
    );
    return saved;
  }

  Future<List<String>?> getSelection(String dayKey, String scope) async {
    final row = await getFirst(
      'SELECT pillar_ids FROM checkin_selections WHERE day_key = ? AND scope = ?',
      [dayKey, scope],
    );
    if (row == null) return null;
    return (jsonDecode(row['pillar_ids'] as String) as List).cast<String>();
  }

  Future<void> saveSelection(
    String dayKey,
    String scope,
    List<String> ids,
  ) => run(
    'INSERT OR IGNORE INTO checkin_selections (day_key, scope, pillar_ids) VALUES (?, ?, ?)',
    [dayKey, scope, jsonEncode(ids)],
  );

  /// Links a check-in log to its reflection note.
  Future<void> updatePillarLogNoteId(String logId, String noteId) async {
    await run('UPDATE pillar_logs SET note_id = ? WHERE id = ?', [
      noteId,
      logId,
    ]);
  }

  // -- Pillar versions -----------------------------------------------------

  Future<List<PillarVersion>> getPillarVersions(String pillarId) async {
    final rows = await getAll(
      'SELECT * FROM pillar_versions WHERE pillar_id = ? ORDER BY version ASC',
      [pillarId],
    );
    return rows.map(PillarVersion.fromRow).whereType<PillarVersion>().toList();
  }

  Future<PillarVersion?> getPillarVersion(String pillarId, int version) async {
    final row = await getFirst(
      'SELECT * FROM pillar_versions WHERE pillar_id = ? AND version = ?',
      [pillarId, version],
    );
    return row == null ? null : PillarVersion.fromRow(row);
  }

  Future<void> insertPillarVersion(PillarVersion version) async {
    final row = version.toRow();
    final columns = row.keys.join(', ');
    final placeholders = List.filled(row.length, '?').join(', ');
    await run(
      'INSERT INTO pillar_versions ($columns) VALUES ($placeholders)',
      row.values.toList(),
    );
  }

  // -- Wipe ----------------------------------------------------------------

  Future<void> deleteAllPillarsData() async {
    await run('DELETE FROM pillars');
    await run('DELETE FROM advice_cards');
    await run('DELETE FROM pillar_logs');
    await run('DELETE FROM pillar_versions');
    await run('DELETE FROM checkin_selections');
  }
}
