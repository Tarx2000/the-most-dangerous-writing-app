/// Persons repository — port of `src/lib/repositories/personsRepository.ts`.
library;

import '../../models/person.dart';
import '../db.dart';

class PersonsRepository {
  /// All persons, newest first.
  Future<List<Person>> getAllPersons() async {
    final rows = await getAll('SELECT * FROM persons ORDER BY created_at DESC');
    return rows.map(Person.fromRow).whereType<Person>().toList();
  }

  Future<Person?> getPersonById(String id) async {
    final row = await getFirst('SELECT * FROM persons WHERE id = ?', [id]);
    return row == null ? null : Person.fromRow(row);
  }

  Future<void> insertPerson(Person person) async {
    final row = person.toRow();
    final columns = row.keys.join(', ');
    final placeholders = List.filled(row.length, '?').join(', ');
    await run('INSERT INTO persons ($columns) VALUES ($placeholders)', row.values.toList());
  }

  static const _allowedColumns = {
    'name', 'nickname', 'relationship', 'birthday', 'bio', 'custom_relationships',
  };

  Future<void> updatePerson(String id, Map<String, Object?> updates) async {
    final sets = <String>[];
    final values = <Object?>[];
    for (final entry in updates.entries) {
      if (!_allowedColumns.contains(entry.key)) continue;
      sets.add('${entry.key} = ?');
      values.add(entry.value);
    }
    if (sets.isEmpty) return;
    values.add(id);
    await run('UPDATE persons SET ${sets.join(', ')} WHERE id = ?', values);
  }

  /// Deletes the person and detaches their notes (person_id → NULL).
  Future<void> deletePerson(String id) async {
    await run('DELETE FROM persons WHERE id = ?', [id]);
    await run('UPDATE notes SET person_id = NULL WHERE person_id = ?', [id]);
  }

  Future<void> deleteAllPersons() async {
    await run('DELETE FROM persons');
  }
}
