/// `SavedVlog` model — verbatim fields of the `vlogs` table (SPEC §6, §11).
library;

class SavedVlog {
  const SavedVlog({
    required this.id,
    required this.filePath,
    required this.dateStr,
    required this.timestamp,
    required this.durationSec,
    this.fileSizeBytes = 0,
    this.thumbnailPath,
    this.compressionPreset,
    this.originalFileSizeBytes,
    this.compressionPending = false,
  });

  final String id;
  final String filePath;
  final String dateStr;
  final int timestamp; // ms
  final int durationSec;
  final int fileSizeBytes;
  final String? thumbnailPath;
  final String? compressionPreset;
  final int? originalFileSizeBytes;
  final bool compressionPending;

  SavedVlog copyWith({
    String? filePath,
    int? fileSizeBytes,
    String? Function()? thumbnailPath,
    String? Function()? compressionPreset,
    int? originalFileSizeBytes,
    bool? compressionPending,
  }) {
    return SavedVlog(
      id: id,
      filePath: filePath ?? this.filePath,
      dateStr: dateStr,
      timestamp: timestamp,
      durationSec: durationSec,
      fileSizeBytes: fileSizeBytes ?? this.fileSizeBytes,
      thumbnailPath: thumbnailPath != null ? thumbnailPath() : this.thumbnailPath,
      compressionPreset:
          compressionPreset != null ? compressionPreset() : this.compressionPreset,
      originalFileSizeBytes: originalFileSizeBytes ?? this.originalFileSizeBytes,
      compressionPending: compressionPending ?? this.compressionPending,
    );
  }

  Map<String, Object?> toRow() {
    return {
      'id': id,
      'file_path': filePath,
      'date_str': dateStr,
      'timestamp': timestamp,
      'duration_sec': durationSec,
      'file_size_bytes': fileSizeBytes,
      'thumbnail_path': thumbnailPath,
      'compression_preset': compressionPreset,
      'original_file_size_bytes': originalFileSizeBytes,
      'compression_pending': compressionPending ? 1 : 0,
    };
  }

  static SavedVlog? fromRow(Map<String, Object?> row) {
    try {
      final id = row['id'];
      final filePath = row['file_path'];
      if (id == null || filePath == null) return null;
      return SavedVlog(
        id: id as String,
        filePath: filePath as String,
        dateStr: (row['date_str'] as String?) ?? '',
        timestamp: (row['timestamp'] as num?)?.toInt() ?? 0,
        durationSec: (row['duration_sec'] as num?)?.toInt() ?? 0,
        fileSizeBytes: (row['file_size_bytes'] as num?)?.toInt() ?? 0,
        thumbnailPath: row['thumbnail_path'] as String?,
        compressionPreset: row['compression_preset'] as String?,
        originalFileSizeBytes: (row['original_file_size_bytes'] as num?)?.toInt(),
        compressionPending: (row['compression_pending'] as num?) == 1,
      );
    } catch (_) {
      return null;
    }
  }
}
