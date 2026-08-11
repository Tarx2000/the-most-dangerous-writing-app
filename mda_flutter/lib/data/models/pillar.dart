/// Masteries (pillars) domain models — `pillars`, `pillar_logs`, `advice_cards`,
/// `pillar_versions` (SPEC §6, §10).
library;

enum PillarType { rating, time, boolean, text }

enum PillarScope { daily, weekly, adaptive }

PillarType pillarTypeFromString(String? raw) =>
    PillarType.values.firstWhere((t) => t.name == raw, orElse: () => PillarType.rating);

PillarScope pillarScopeFromString(String? raw) =>
    PillarScope.values.firstWhere((s) => s.name == raw, orElse: () => PillarScope.daily);

class Pillar {
  const Pillar({
    required this.id,
    required this.title,
    required this.type,
    required this.scope,
    required this.createdAt,
    this.adaptiveDays = 14,
    this.isActive = true,
    this.description,
    this.lastEditedAt,
    this.version = 1,
  });

  final String id;
  final String title;
  final PillarType type;
  final PillarScope scope;
  final int createdAt; // ms
  final int adaptiveDays;
  final bool isActive;
  final String? description;
  final int? lastEditedAt; // ms
  final int version;

  Pillar copyWith({
    String? title,
    PillarType? type,
    PillarScope? scope,
    int? adaptiveDays,
    bool? isActive,
    String? Function()? description,
    int? lastEditedAt,
    int? version,
  }) {
    return Pillar(
      id: id,
      title: title ?? this.title,
      type: type ?? this.type,
      scope: scope ?? this.scope,
      createdAt: createdAt,
      adaptiveDays: adaptiveDays ?? this.adaptiveDays,
      isActive: isActive ?? this.isActive,
      description: description != null ? description() : this.description,
      lastEditedAt: lastEditedAt ?? this.lastEditedAt,
      version: version ?? this.version,
    );
  }

  Map<String, Object?> toRow() {
    return {
      'id': id,
      'title': title,
      'type': type.name,
      'scope': scope.name,
      'created_at': createdAt,
      'adaptive_days': adaptiveDays,
      'is_active': isActive ? 1 : 0,
      'description': description,
      'last_edited_at': lastEditedAt,
      'version': version,
    };
  }

  static Pillar? fromRow(Map<String, Object?> row) {
    try {
      final id = row['id'];
      final title = row['title'];
      if (id == null || title == null) return null;
      return Pillar(
        id: id as String,
        title: title as String,
        type: pillarTypeFromString(row['type'] as String?),
        scope: pillarScopeFromString(row['scope'] as String?),
        createdAt: (row['created_at'] as num?)?.toInt() ?? 0,
        adaptiveDays: (row['adaptive_days'] as num?)?.toInt() ?? 14,
        isActive: (row['is_active'] as num?) != 0,
        description: row['description'] as String?,
        lastEditedAt: (row['last_edited_at'] as num?)?.toInt(),
        version: (row['version'] as num?)?.toInt() ?? 1,
      );
    } catch (_) {
      return null;
    }
  }
}

class PillarLog {
  const PillarLog({
    required this.id,
    required this.pillarId,
    this.valueNum,
    this.valueStr,
    required this.timestamp,
    this.noteId,
  });

  final String id;
  final String pillarId;
  final double? valueNum; // boolean → 1.0/0.0
  final String? valueStr;
  final int timestamp; // ms
  final String? noteId;

  Map<String, Object?> toRow() {
    return {
      'id': id,
      'pillar_id': pillarId,
      'value_num': valueNum,
      'value_str': valueStr,
      'timestamp': timestamp,
      'note_id': noteId,
    };
  }

  static PillarLog? fromRow(Map<String, Object?> row) {
    try {
      final id = row['id'];
      final pillarId = row['pillar_id'];
      if (id == null || pillarId == null) return null;
      return PillarLog(
        id: id as String,
        pillarId: pillarId as String,
        valueNum: (row['value_num'] as num?)?.toDouble(),
        valueStr: row['value_str'] as String?,
        timestamp: (row['timestamp'] as num?)?.toInt() ?? 0,
        noteId: row['note_id'] as String?,
      );
    } catch (_) {
      return null;
    }
  }
}

class AdviceCard {
  const AdviceCard({
    required this.id,
    required this.text,
    required this.createdAt,
    this.lastReflectedAt,
    this.reflectionCount = 0,
    this.isActive = true,
  });

  final String id;
  final String text;
  final int createdAt; // ms
  final int? lastReflectedAt; // ms
  final int reflectionCount;
  final bool isActive;

  Map<String, Object?> toRow() {
    return {
      'id': id,
      'text': text,
      'created_at': createdAt,
      'last_reflected_at': lastReflectedAt,
      'reflection_count': reflectionCount,
      'is_active': isActive ? 1 : 0,
    };
  }

  static AdviceCard? fromRow(Map<String, Object?> row) {
    try {
      final id = row['id'];
      final text = row['text'];
      if (id == null || text == null) return null;
      return AdviceCard(
        id: id as String,
        text: text as String,
        createdAt: (row['created_at'] as num?)?.toInt() ?? 0,
        lastReflectedAt: (row['last_reflected_at'] as num?)?.toInt(),
        reflectionCount: (row['reflection_count'] as num?)?.toInt() ?? 0,
        isActive: (row['is_active'] as num?) != 0,
      );
    } catch (_) {
      return null;
    }
  }
}

class PillarVersion {
  const PillarVersion({
    required this.id,
    required this.pillarId,
    required this.version,
    required this.title,
    this.description,
    required this.createdAt,
  });

  final String id;
  final String pillarId;
  final int version;
  final String title;
  final String? description;
  final int createdAt; // ms

  Map<String, Object?> toRow() {
    return {
      'id': id,
      'pillar_id': pillarId,
      'version': version,
      'title': title,
      'description': description,
      'created_at': createdAt,
    };
  }

  static PillarVersion? fromRow(Map<String, Object?> row) {
    try {
      final id = row['id'];
      final pillarId = row['pillar_id'];
      if (id == null || pillarId == null) return null;
      return PillarVersion(
        id: id as String,
        pillarId: pillarId as String,
        version: (row['version'] as num?)?.toInt() ?? 1,
        title: (row['title'] as String?) ?? '',
        description: row['description'] as String?,
        createdAt: (row['created_at'] as num?)?.toInt() ?? 0,
      );
    } catch (_) {
      return null;
    }
  }
}
