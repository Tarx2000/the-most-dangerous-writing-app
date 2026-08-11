/// `SavedNote` model — verbatim fields of the `notes` table (SPEC §6).
library;

import 'dart:convert' show jsonDecode, jsonEncode;

import '../../core/utils.dart';

class SavedNote {
  const SavedNote({
    required this.id,
    required this.text,
    required this.dateStr,
    required this.timestamp,
    required this.durationMin,
    required this.won,
    this.personId,
    this.isQuickNote = false,
    this.isTweet = false,
    this.aiTitle,
    this.aiSummary,
    this.aiModelUsed,
    this.isAlignmentReflection = false,
    this.alignmentScore,
    this.stopText,
    this.startText,
    this.continueText,
    this.pillarId,
    this.adviceId,
    this.pillarValue,
    this.pillarVersion,
  });

  final String id;
  final String text;
  final String dateStr;
  final int timestamp; // ms since epoch
  final int durationMin;
  final bool won;
  final String? personId;
  final bool isQuickNote;
  final bool isTweet;
  final String? aiTitle;
  final List<String>? aiSummary;
  final String? aiModelUsed;
  final bool isAlignmentReflection;
  final int? alignmentScore;
  final String? stopText;
  final String? startText;
  final String? continueText;
  final String? pillarId;
  final String? adviceId;
  final double? pillarValue;
  final int? pillarVersion;

  DateTime get dateTime => DateTime.fromMillisecondsSinceEpoch(timestamp);

  int get wordCount => countWords(text);

  bool get isEligibleForAi => !isTweet && wordCount >= 45;

  SavedNote copyWith({
    String? id,
    String? text,
    String? dateStr,
    int? timestamp,
    int? durationMin,
    bool? won,
    String? Function()? personId,
    bool? isQuickNote,
    bool? isTweet,
    String? Function()? aiTitle,
    List<String>? aiSummary,
    String? Function()? aiModelUsed,
    bool? isAlignmentReflection,
    int? alignmentScore,
    String? Function()? stopText,
    String? Function()? startText,
    String? Function()? continueText,
    String? Function()? pillarId,
    String? Function()? adviceId,
    double? pillarValue,
    int? pillarVersion,
  }) {
    return SavedNote(
      id: id ?? this.id,
      text: text ?? this.text,
      dateStr: dateStr ?? this.dateStr,
      timestamp: timestamp ?? this.timestamp,
      durationMin: durationMin ?? this.durationMin,
      won: won ?? this.won,
      personId: personId != null ? personId() : this.personId,
      isQuickNote: isQuickNote ?? this.isQuickNote,
      isTweet: isTweet ?? this.isTweet,
      aiTitle: aiTitle != null ? aiTitle() : this.aiTitle,
      aiSummary: aiSummary ?? this.aiSummary,
      aiModelUsed: aiModelUsed != null ? aiModelUsed() : this.aiModelUsed,
      isAlignmentReflection: isAlignmentReflection ?? this.isAlignmentReflection,
      alignmentScore: alignmentScore ?? this.alignmentScore,
      stopText: stopText != null ? stopText() : this.stopText,
      startText: startText != null ? startText() : this.startText,
      continueText: continueText != null ? continueText() : this.continueText,
      pillarId: pillarId != null ? pillarId() : this.pillarId,
      adviceId: adviceId != null ? adviceId() : this.adviceId,
      pillarValue: pillarValue ?? this.pillarValue,
      pillarVersion: pillarVersion ?? this.pillarVersion,
    );
  }

  /// snake_case row for SQLite (and backup scope export).
  Map<String, Object?> toRow() {
    return {
      'id': id,
      'text': text,
      'date_str': dateStr,
      'timestamp': timestamp,
      'duration_min': durationMin,
      'won': won ? 1 : 0,
      'person_id': personId,
      'is_quick_note': isQuickNote ? 1 : 0,
      'is_tweet': isTweet ? 1 : 0,
      'ai_title': aiTitle,
      'ai_summary': aiSummary != null ? _encodeSummary(aiSummary!) : null,
      'ai_model_used': aiModelUsed,
      'is_alignment_reflection': isAlignmentReflection ? 1 : 0,
      'alignment_score': alignmentScore,
      'stop_text': stopText,
      'start_text': startText,
      'continue_text': continueText,
      'pillar_id': pillarId,
      'advice_id': adviceId,
      'pillar_value': pillarValue,
      'pillar_version': pillarVersion,
    };
  }

  /// Shape-guarded row converter — malformed rows never crash startup.
  static SavedNote? fromRow(Map<String, Object?> row) {
    try {
      final id = row['id'];
      final text = row['text'];
      if (id == null || text == null) return null;
      return SavedNote(
        id: id as String,
        text: text as String,
        dateStr: (row['date_str'] as String?) ?? '',
        timestamp: (row['timestamp'] as num?)?.toInt() ?? 0,
        durationMin: (row['duration_min'] as num?)?.toInt() ?? 0,
        won: (row['won'] as num?) == 1,
        personId: row['person_id'] as String?,
        isQuickNote: (row['is_quick_note'] as num?) == 1,
        isTweet: (row['is_tweet'] as num?) == 1,
        aiTitle: row['ai_title'] as String?,
        aiSummary: _decodeSummary(row['ai_summary'] as String?),
        aiModelUsed: row['ai_model_used'] as String?,
        isAlignmentReflection: (row['is_alignment_reflection'] as num?) == 1,
        alignmentScore: (row['alignment_score'] as num?)?.toInt(),
        stopText: row['stop_text'] as String?,
        startText: row['start_text'] as String?,
        continueText: row['continue_text'] as String?,
        pillarId: row['pillar_id'] as String?,
        adviceId: row['advice_id'] as String?,
        pillarValue: (row['pillar_value'] as num?)?.toDouble(),
        pillarVersion: (row['pillar_version'] as num?)?.toInt(),
      );
    } catch (_) {
      return null;
    }
  }

  static String? _encodeSummary(List<String> bullets) {
    try {
      return jsonEncode(bullets);
    } catch (_) {
      return null;
    }
  }

  /// JSON-summary decode with shape guard (must never throw).
  static List<String>? _decodeSummary(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is List) {
        return [for (final item in decoded) if (item is String) item];
      }
      return null;
    } catch (_) {
      return null;
    }
  }
}

/// Sort options for the library (SPEC §2).
enum SortOption { newest, oldest, longest, shortest, longestText }
