/// PostWritingScreen — post-writing enrichment (SPEC §8, §9).
///
/// The note is already saved before arriving here. This screen shows the AI
/// title/summary states (shimmer while queued/processing, offline banner,
/// "short entry" notice), offers edit mode, and the grammar check entry point.
/// The AI queue itself lands in Phase 4 — the UI contract is complete here.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../core/utils.dart';
import '../../../data/ai_providers.dart';
import '../../../data/models/saved_note.dart';
import '../../../data/providers.dart';
import '../../../data/services/ai_error.dart';
import '../../../data/services/ai_service.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/rich_text.dart';
import '../../core/widgets/shimmer_line.dart';

class PostWritingScreen extends ConsumerStatefulWidget {
  const PostWritingScreen({super.key, required this.noteId});

  final String noteId;

  @override
  ConsumerState<PostWritingScreen> createState() => _PostWritingScreenState();
}

class _PostWritingScreenState extends ConsumerState<PostWritingScreen> {
  bool _editing = false;
  final TextEditingController _editController = TextEditingController();

  SavedNote? get _note {
    for (final note in ref.watch(notesProvider)) {
      if (note.id == widget.noteId) return note;
    }
    return null;
  }

  bool get _aiActive {
    final manager = ref.watch(aiQueueManagerProvider);
    return manager.isNoteActive(widget.noteId) || manager.isNoteQueued(widget.noteId);
  }

  @override
  void initState() {
    super.initState();
    _maybeEnqueueAi();
  }

  /// AI gate (SPEC §9): auto-generate when enabled, not a tweet, ≥ 45 words
  /// and no existing AI title/summary.
  void _maybeEnqueueAi() {
    final note = _note;
    if (note == null) return;
    final prefs = ref.read(preferencesProvider);
    if (prefs.autoGenerateSummaries &&
        note.isEligibleForAi &&
        (note.aiTitle == null || note.aiTitle!.isEmpty)) {
      ref.read(aiQueueManagerProvider).enqueueNote(
            note.id,
            aiCategoryForNote(
              isAlignmentReflection: note.isAlignmentReflection,
              personId: note.personId,
            ),
          );
    }
  }

  void _enableAiManually() {
    final note = _note;
    if (note == null) return;
    ref.read(aiQueueManagerProvider).enqueueNote(
          note.id,
          aiCategoryForNote(
            isAlignmentReflection: note.isAlignmentReflection,
            personId: note.personId,
          ),
        );
    setState(() {});
  }

  // -- Grammar check (user-triggered, inline, not queued — SPEC §9) ----------

  bool _checkingGrammar = false;
  List<GrammarSuggestion>? _grammarSuggestions;
  String? _grammarError;

  Future<void> _runGrammarCheck() async {
    final note = _note;
    if (note == null || _checkingGrammar) return;
    setState(() {
      _checkingGrammar = true;
      _grammarSuggestions = null;
      _grammarError = null;
    });
    try {
      final config = ref.read(aiConfigProvider).toRuntimeConfig();
      final suggestions =
          await ref.read(aiServiceProvider).checkGrammar(config: config, text: note.text);
      if (!mounted) return;
      setState(() {
        _checkingGrammar = false;
        _grammarSuggestions = suggestions;
      });
    } on AiError catch (e) {
      if (!mounted) return;
      // Never show "No issues found!" on failure (SPEC §9).
      setState(() {
        _checkingGrammar = false;
        _grammarError = e.uiMessage;
      });
    }
  }

  void _applySuggestion(GrammarSuggestion suggestion, SavedNote note) {
    final updated = note.text.replaceFirst(suggestion.original, suggestion.suggestion);
    if (updated == note.text) return;
    ref.read(appDataProvider.notifier).updateNote(note.id, {'text': updated});
    setState(() {});
  }

  void _toggleEdit() {
    setState(() {
      _editing = !_editing;
      if (_editing) {
        _editController.text = _note?.text ?? '';
      }
    });
  }

  Future<void> _saveEdit() async {
    final text = _editController.text.trim();
    if (text.isEmpty) return;
    await ref.read(appDataProvider.notifier).updateNote(widget.noteId, {'text': text});
    if (!mounted) return;
    setState(() => _editing = false);
    _closeWithFlyAway();
  }

  void _closeWithFlyAway() {
    vibrate(HapticPatterns.tick);
    context.pop();
  }

  @override
  void dispose() {
    _editController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final note = _note;
    if (note == null) {
      return const Scaffold(
        backgroundColor: AppColors.background,
        body: Center(
          child: Text('Entry not found', style: TextStyle(color: AppColors.textMuted)),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header row: close + edit toggle + delete
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    onPressed: _closeWithFlyAway,
                    icon: Icon(Mdi.get('close'), color: AppColors.textSecondary),
                  ),
                  Row(
                    children: [
                      IconButton(
                        onPressed: _toggleEdit,
                        icon: Icon(
                          _editing ? Mdi.get('check') : Mdi.get('pencilOutline'),
                          color: _editing ? AppColors.green : AppColors.textSecondary,
                        ),
                      ),
                      IconButton(
                        onPressed: _closeWithFlyAway,
                        icon: Icon(Mdi.get('trashCanOutline'), color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
                child: _editing ? _buildEditor(note) : _buildViewer(note),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildViewer(SavedNote note) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildTitleSection(note),
        const SizedBox(height: 20),
        Text(
          '${note.wordCount} words · ${note.durationMin} min',
          style: const TextStyle(
            color: AppColors.primaryAction,
            fontSize: 13,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 20),
        _buildSummaryCard(note),
        const SizedBox(height: 24),
        _buildGrammarSection(note),
        const SizedBox(height: 20),
        Text(
          note.text,
          style: const TextStyle(
            color: AppColors.textBody,
            fontSize: 18,
            height: 1.55,
          ),
        ),
      ],
    );
  }

  /// Grammar check section (SPEC §9): button → suggestions (tap to apply)
  /// or an error banner (never a false "no issues").
  Widget _buildGrammarSection(SavedNote note) {
    if (_checkingGrammar) {
      return const Row(
        children: [
          ShimmerLine(width: 120, height: 14),
          SizedBox(width: 10),
          ShimmerLine(width: 60, height: 14),
        ],
      );
    }
    if (_grammarError != null) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.dangerFill,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.dangerBorder, width: 1),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                _grammarError!,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
              ),
            ),
            const SizedBox(width: 10),
            AnimatedScaleButton(
              onPress: _runGrammarCheck,
              child: const Text(
                'Try again',
                style: TextStyle(
                  color: AppColors.primaryAction,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      );
    }
    final suggestions = _grammarSuggestions;
    if (suggestions != null) {
      if (suggestions.isEmpty) {
        return const Text(
          'No issues found! ✨',
          style: TextStyle(color: AppColors.green, fontSize: 14, fontWeight: FontWeight.w600),
        );
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final suggestion in suggestions)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: AnimatedScaleButton(
                onPress: () => _applySuggestion(suggestion, note),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.suggestionBackground,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.suggestionBorder, width: 1),
                  ),
                  child: Row(
                    children: [
                      Icon(Mdi.get('pencilOutline'), color: AppColors.suggestionError, size: 16),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text.rich(
                              TextSpan(
                                children: [
                                  TextSpan(
                                    text: suggestion.original,
                                    style: const TextStyle(
                                      color: AppColors.suggestionError,
                                      decoration: TextDecoration.lineThrough,
                                    ),
                                  ),
                                  const TextSpan(text: '  →  '),
                                  TextSpan(
                                    text: suggestion.suggestion,
                                    style: const TextStyle(color: AppColors.gold),
                                  ),
                                ],
                              ),
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              suggestion.explanation,
                              style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          const SizedBox(height: 6),
          AnimatedScaleButton(
            onPress: _runGrammarCheck,
            child: const Text(
              'Check again',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      );
    }
    return AnimatedScaleButton(
      onPress: _runGrammarCheck,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
        decoration: BoxDecoration(
          color: AppColors.glassSurfaceLow,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.glassBorder, width: 1),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Mdi.get('spellcheck'), color: AppColors.textSecondary, size: 16),
            const SizedBox(width: 8),
            const Text(
              'Check grammar',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13, fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTitleSection(SavedNote note) {
    if (_aiActive) {
      return const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ShimmerLine(width: 220, height: 28),
          SizedBox(height: 8),
          ShimmerLine(width: 140, height: 16),
        ],
      );
    }
    if (note.aiTitle != null && note.aiTitle!.isNotEmpty) {
      return AppRichText(
        note.aiTitle!,
        style: const TextStyle(
          color: AppColors.textPrimary,
          fontSize: 26,
          fontWeight: FontWeight.w900,
          height: 1.2,
        ),
      );
    }
    if (!note.isEligibleForAi) {
      return const Text(
        'Untitled Entry',
        style: TextStyle(
          color: AppColors.textPrimary,
          fontSize: 26,
          fontWeight: FontWeight.w900,
        ),
      );
    }
    // AI failed or disabled — offer manual processing (Phase 4 wires the queue).
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Untitled Entry',
          style: TextStyle(color: AppColors.textPrimary, fontSize: 26, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 12),
        AnimatedScaleButton(
          onPress: _enableAiManually,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: AppColors.dangerTint,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.dangerBorder, width: 1),
            ),
            child: const Text(
              'Enable AI processing for this entry',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13, fontWeight: FontWeight.w700),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSummaryCard(SavedNote note) {
    final summary = note.aiSummary;
    if (summary == null || summary.isEmpty) {
      if (_aiActive) {
        return const Row(
          children: [
            ShimmerLine(width: 40, height: 14),
            SizedBox(width: 12),
            ShimmerLine(width: 260, height: 14),
          ],
        );
      }
      return const SizedBox.shrink();
    }
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.glassSurfaceMinimal,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.glassBorderSubtle, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Mdi.get('brain'), color: AppColors.primaryAction, size: 18),
              const SizedBox(width: 8),
              const Text(
                'AI SUMMARY',
                style: TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (final bullet in summary)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: AppRichText(
                '• $bullet',
                style: const TextStyle(color: AppColors.textBody, fontSize: 15, height: 1.4),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildEditor(SavedNote note) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '${countWords(_editController.text)} words',
          style: const TextStyle(color: AppColors.textDim, fontSize: 13, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _editController,
          maxLines: null,
          style: const TextStyle(color: AppColors.textInput, fontSize: 18, height: 1.55),
          cursorColor: AppColors.primaryAction,
          decoration: const InputDecoration(
            border: InputBorder.none,
          ),
        ),
        const SizedBox(height: 24),
        AnimatedScaleButton(
          onPress: _saveEdit,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 14),
            decoration: BoxDecoration(
              color: AppColors.primaryAction,
              borderRadius: BorderRadius.circular(30),
            ),
            child: const Text(
              'SAVE & CLOSE',
              style: TextStyle(color: AppColors.primaryActionText, fontSize: 16, fontWeight: FontWeight.w800),
            ),
          ),
        ),
      ],
    );
  }
}
