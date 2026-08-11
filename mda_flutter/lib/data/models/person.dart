/// `Person` model — verbatim fields of the `persons` table (SPEC §6).
library;

class Person {
  const Person({
    required this.id,
    required this.name,
    required this.createdAt,
    this.nickname,
    this.relationship,
    this.birthday,
    this.bio,
    this.customRelationships,
  });

  final String id;
  final String name;
  final int createdAt; // ms since epoch
  final String? nickname;
  final String? relationship;
  final String? birthday; // ISO date
  final String? bio;
  final List<String>? customRelationships;

  String get displayName => nickname ?? name;

  Person copyWith({
    String? name,
    String? Function()? nickname,
    String? Function()? relationship,
    String? Function()? birthday,
    String? Function()? bio,
    List<String>? customRelationships,
  }) {
    return Person(
      id: id,
      name: name ?? this.name,
      createdAt: createdAt,
      nickname: nickname != null ? nickname() : this.nickname,
      relationship: relationship != null ? relationship() : this.relationship,
      birthday: birthday != null ? birthday() : this.birthday,
      bio: bio != null ? bio() : this.bio,
      customRelationships: customRelationships ?? this.customRelationships,
    );
  }

  Map<String, Object?> toRow() {
    return {
      'id': id,
      'name': name,
      'created_at': createdAt,
      'nickname': nickname,
      'relationship': relationship,
      'birthday': birthday,
      'bio': bio,
      'custom_relationships': customRelationships?.join(','),
    };
  }

  static Person? fromRow(Map<String, Object?> row) {
    try {
      final id = row['id'];
      final name = row['name'];
      if (id == null || name == null) return null;
      return Person(
        id: id as String,
        name: name as String,
        createdAt: (row['created_at'] as num?)?.toInt() ?? 0,
        nickname: row['nickname'] as String?,
        relationship: row['relationship'] as String?,
        birthday: row['birthday'] as String?,
        bio: row['bio'] as String?,
        customRelationships: _decodeCustom(row['custom_relationships'] as String?),
      );
    } catch (_) {
      return null;
    }
  }

  static List<String>? _decodeCustom(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    return [for (final part in raw.split(',')) if (part.isNotEmpty) part];
  }
}

/// Relationship picker options (SPEC, person.ts).
const List<String> relationshipOptions = [
  'Friend',
  'Family',
  'Partner',
  'Colleague',
  'Mentor',
  'School Mate',
  'Childhood Friend',
  'Neighbor',
  'Acquaintance',
  'Other',
];
