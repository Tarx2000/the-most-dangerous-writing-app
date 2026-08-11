/// Vlogs repository — port of `src/lib/repositories/vlogsRepository.ts`.
/// Rows are path-rebased to the current device's documents directory so stale
/// absolute paths (after reinstall) heal automatically.
library;

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../models/saved_vlog.dart';
import '../db.dart';

class VlogsRepository {
  VlogsRepository({Future<String> Function()? documentsDirProvider})
      : _documentsDirProvider = documentsDirProvider ?? _defaultDocumentsDir;

  final Future<String> Function() _documentsDirProvider;

  static Future<String> _defaultDocumentsDir() async {
    final docs = await getApplicationDocumentsDirectory();
    return docs.path;
  }

  /// All vlogs, newest first — with paths rebased to the current sandbox.
  Future<List<SavedVlog>> getAllVlogs() async {
    final docs = await _documentsDirProvider();
    final rows = await getAll('SELECT * FROM vlogs ORDER BY timestamp DESC');
    return rows.map((row) => _rebased(row, docs)).whereType<SavedVlog>().toList();
  }

  /// Rebases file_path/thumbnail_path to `$docs/vlogs/` / `$docs/vlog_thumbnails/`.
  SavedVlog? _rebased(Map<String, Object?> row, String docs) {
    final vlog = SavedVlog.fromRow(row);
    if (vlog == null) return null;
    return SavedVlog(
      id: vlog.id,
      filePath: p.join(docs, 'vlogs', p.basename(vlog.filePath)),
      dateStr: vlog.dateStr,
      timestamp: vlog.timestamp,
      durationSec: vlog.durationSec,
      fileSizeBytes: vlog.fileSizeBytes,
      thumbnailPath: vlog.thumbnailPath != null
          ? p.join(docs, 'vlog_thumbnails', p.basename(vlog.thumbnailPath!))
          : null,
      compressionPreset: vlog.compressionPreset,
      originalFileSizeBytes: vlog.originalFileSizeBytes,
      compressionPending: vlog.compressionPending,
    );
  }

  Future<void> insertVlog(SavedVlog vlog) async {
    final row = vlog.toRow();
    final columns = row.keys.join(', ');
    final placeholders = List.filled(row.length, '?').join(', ');
    await run('INSERT INTO vlogs ($columns) VALUES ($placeholders)', row.values.toList());
  }

  static const _allowedColumns = {
    'file_path', 'file_size_bytes', 'thumbnail_path', 'compression_preset',
    'original_file_size_bytes', 'compression_pending',
  };

  Future<void> updateVlog(String id, Map<String, Object?> updates) async {
    final sets = <String>[];
    final values = <Object?>[];
    for (final entry in updates.entries) {
      if (!_allowedColumns.contains(entry.key)) continue;
      sets.add('${entry.key} = ?');
      values.add(entry.value);
    }
    if (sets.isEmpty) return;
    values.add(id);
    await run('UPDATE vlogs SET ${sets.join(', ')} WHERE id = ?', values);
  }

  Future<void> deleteVlog(String id) async {
    await run('DELETE FROM vlogs WHERE id = ?', [id]);
  }

  Future<void> deleteAllVlogs() async {
    await run('DELETE FROM vlogs');
  }
}
