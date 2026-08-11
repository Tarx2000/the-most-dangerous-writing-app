/// Notes repository — port of `src/lib/repositories/notesRepository.ts`.
library;

import '../../models/saved_note.dart';
import '../db.dart';

class NotesRepository {
  /// All notes, newest first.
  Future<List<SavedNote>> getAllNotes() async {
    final rows = await getAll('SELECT * FROM notes ORDER BY timestamp DESC');
    return rows.map(SavedNote.fromRow).whereType<SavedNote>().toList();
  }

  Future<SavedNote?> getNoteById(String id) async {
    final row = await getFirst('SELECT * FROM notes WHERE id = ?', [id]);
    return row == null ? null : SavedNote.fromRow(row);
  }

  Future<void> insertNote(SavedNote note) async {
    final row = note.toRow();
    final columns = row.keys.join(', ');
    final placeholders = List.filled(row.length, '?').join(', ');
    await run('INSERT INTO notes ($columns) VALUES ($placeholders)', row.values.toList());
  }

  static const _allowedColumns = {
    'text', 'date_str', 'timestamp', 'duration_min', 'won', 'person_id', 'is_quick_note',
    'is_tweet', 'ai_title', 'ai_summary', 'ai_model_used', 'is_alignment_reflection',
    'pillar_id', 'advice_id', 'pillar_value', 'pillar_version',
  };

  /// Partial update — only whitelisted columns are writable.
  Future<void> updateNote(String id, Map<String, Object?> updates) async {
    final sets = <String>[];
    final values = <Object?>[];
    for (final entry in updates.entries) {
      if (!_allowedColumns.contains(entry.key)) continue;
      sets.add('${entry.key} = ?');
      values.add(entry.value);
    }
    if (sets.isEmpty) return;
    values.add(id);
    await run('UPDATE notes SET ${sets.join(', ')} WHERE id = ?', values);
  }

  Future<void> deleteNote(String id) async {
    await run('DELETE FROM notes WHERE id = ?', [id]);
  }

  /// Wipes AI metadata app-wide (settings "clear AI data").
  Future<void> clearAllAiMetadata() async {
    await run('UPDATE notes SET ai_title = NULL, ai_summary = NULL, ai_model_used = NULL');
  }

  Future<void> deleteAllNotes() async {
    await run('DELETE FROM notes');
  }
}
