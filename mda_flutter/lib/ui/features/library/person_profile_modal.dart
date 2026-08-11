/// PersonProfileModal — circle profile (port of `PersonProfileModal.tsx`,
/// SPEC §15). Gradient avatar ring (primaryAction→orange→primaryAction) ·
/// name · relationship badge · 3-stat row (Entries / Words / Since) ·
/// About (birthday, bio) · Recent Entries · edit mode with nickname,
/// relationship picker, birthday, bio · red "Delete Person" danger zone.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/models/person.dart';
import '../../../data/models/saved_note.dart';
import '../../../data/providers.dart';
import '../../core/widgets/animated_scale_button.dart';
import 'note_viewer_modal.dart';

class PersonProfileModal extends ConsumerStatefulWidget {
  const PersonProfileModal({super.key, required this.personId, required this.onClose});

  final String personId;
  final VoidCallback onClose;

  @override
  ConsumerState<PersonProfileModal> createState() => _PersonProfileModalState();
}

class _PersonProfileModalState extends ConsumerState<PersonProfileModal> {
  bool _editing = false;
  bool _confirmDelete = false;
  late TextEditingController _nameController;
  late TextEditingController _nicknameController;
  late TextEditingController _birthdayController;
  late TextEditingController _bioController;
  String? _relationship;

  Person? get _person {
    for (final p in ref.watch(personsProvider)) {
      if (p.id == widget.personId) return p;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    final person = _person;
    _nameController = TextEditingController(text: person?.name ?? '');
    _nicknameController = TextEditingController(text: person?.nickname ?? '');
    _birthdayController = TextEditingController(text: person?.birthday ?? '');
    _bioController = TextEditingController(text: person?.bio ?? '');
    _relationship = person?.relationship;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _nicknameController.dispose();
    _birthdayController.dispose();
    _bioController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final person = _person;
    if (person == null) return;
    vibrate(HapticPatterns.unlockSuccess);
    await ref.read(appDataProvider.notifier).updatePerson(person.id, {
      'name': _nameController.text.trim().isEmpty ? person.name : _nameController.text.trim(),
      'nickname': _nicknameController.text.trim().isEmpty ? null : _nicknameController.text.trim(),
      'relationship': _relationship,
      'birthday': _birthdayController.text.trim().isEmpty ? null : _birthdayController.text.trim(),
      'bio': _bioController.text.trim().isEmpty ? null : _bioController.text.trim(),
    });
    if (mounted) setState(() => _editing = false);
  }

  Future<void> _delete() async {
    final person = _person;
    if (person == null) return;
    await ref.read(appDataProvider.notifier).deletePerson(person.id);
    widget.onClose();
  }

  @override
  Widget build(BuildContext context) {
    final person = _person;
    if (person == null) {
      return const SizedBox.shrink();
    }
    final notes = ref.watch(notesProvider).where((n) => n.personId == person.id).toList();
    final totalWords = notes.fold<int>(0, (sum, n) => sum + n.wordCount);

    return Material(
      color: AppColors.overlayVideoStrong,
      child: Align(
        alignment: Alignment.bottomCenter,
        child: GestureDetector(
          onVerticalDragEnd: (details) {
            if (details.primaryVelocity != null && details.primaryVelocity! > 1000) {
              widget.onClose();
            }
          },
          child: Container(
            height: MediaQuery.sizeOf(context).height * 0.9,
            decoration: const BoxDecoration(
              color: AppColors.surfaceDark,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 16, 24, 40),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        IconButton(
                          onPressed: widget.onClose,
                          icon: Icon(Mdi.get('close'), color: AppColors.textSecondary),
                        ),
                        const Spacer(),
                        AnimatedScaleButton(
                          onPress: () => setState(() => _editing = !_editing),
                          child: Row(
                            children: [
                              Icon(
                                _editing ? Mdi.get('check') : Mdi.get('pencilOutline'),
                                color: _editing ? AppColors.green : AppColors.textSecondary,
                                size: 18,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                _editing ? 'Done' : 'Edit',
                                style: const TextStyle(
                                  color: AppColors.textSecondary,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    // Avatar ring (gradient) + name
                    Center(
                      child: Column(
                        children: [
                          Container(
                            width: 96,
                            height: 96,
                            padding: const EdgeInsets.all(3),
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: LinearGradient(
                                colors: [
                                  AppColors.primaryAction,
                                  AppColors.orange,
                                  AppColors.primaryAction,
                                ],
                              ),
                            ),
                            child: Container(
                              alignment: Alignment.center,
                              decoration: const BoxDecoration(
                                color: AppColors.surfaceDark,
                                shape: BoxShape.circle,
                              ),
                              child: Text(
                                person.name.isEmpty ? '?' : person.name[0].toUpperCase(),
                                style: const TextStyle(
                                  color: AppColors.textPrimary,
                                  fontSize: 34,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          if (_editing)
                            _EditField(controller: _nameController, label: 'Name')
                          else
                            Text(
                              person.displayName,
                              style: const TextStyle(
                                color: AppColors.textPrimary,
                                fontSize: 22,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          const SizedBox(height: 6),
                          if (!_editing && person.relationship != null)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                              decoration: BoxDecoration(
                                color: AppColors.dangerTint,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Text(
                                person.relationship!,
                                style: const TextStyle(
                                  color: AppColors.primaryAction,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                    // 3-stat row
                    Row(
                      children: [
                        _StatCell(value: '$notes.length', label: 'Entries'),
                        _StatCell(value: '$totalWords', label: 'Words'),
                        _StatCell(
                          value: _sinceLabel(person.createdAt),
                          label: 'Since',
                        ),                      ],
                    ),
                    const SizedBox(height: 24),
                    // About / edit fields
                    const Text(
                      'ABOUT',
                      style: TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.5,
                      ),
                    ),
                    const SizedBox(height: 10),
                    if (_editing) ...[
                      const SizedBox(height: 4),
                      _EditField(controller: _nicknameController, label: 'Nickname'),
                      const SizedBox(height: 10),
                      _RelationshipPicker(
                        selected: _relationship,
                        onSelect: (r) => setState(() => _relationship = r),
                      ),
                      const SizedBox(height: 10),
                      _EditField(controller: _birthdayController, label: 'Birthday (YYYY-MM-DD)'),
                      const SizedBox(height: 10),
                      _EditField(controller: _bioController, label: 'Bio', maxLines: 3),
                      const SizedBox(height: 16),
                      AnimatedScaleButton(
                        onPress: _save,
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          decoration: BoxDecoration(
                            color: AppColors.primaryAction,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Text(
                            'SAVE CHANGES',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: AppColors.primaryActionText,
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                    ] else ...[
                      if (person.bio != null || person.birthday != null) ...[
                        Text(
                          [
                            if (person.birthday != null) '🎂 ${person.birthday}',
                            if (person.bio != null) person.bio!,
                          ].join('\n'),
                          style: const TextStyle(
                            color: AppColors.textBody,
                            fontSize: 14,
                            height: 1.5,
                          ),
                        ),
                        const SizedBox(height: 20),
                      ],
                      // Recent entries
                      const Text(
                        'RECENT ENTRIES',
                        style: TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.5,
                        ),
                      ),
                      const SizedBox(height: 10),
                      for (final note in notes.take(5))
                        _RecentNoteRow(
                          note: note,
                          onTap: () => showNoteViewer(context, note: note),
                        ),
                      if (notes.isEmpty)
                        const Text(
                          'No entries with this person yet.',
                          style: TextStyle(color: AppColors.textMuted, fontSize: 14),
                        ),
                    ],
                    const SizedBox(height: 32),
                    // Danger zone (edit mode only)
                    if (_editing)
                      _confirmDelete
                          ? Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: AppColors.dangerSubtle,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: AppColors.dangerBorderMedium, width: 1),
                              ),
                              child: Column(
                                children: [
                                  const Text(
                                    'Delete this person and all their entries?',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: AppColors.textPrimary,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: AnimatedScaleButton(
                                          onPress: () => setState(() => _confirmDelete = false),
                                          child: Container(
                                            padding: const EdgeInsets.symmetric(vertical: 12),
                                            decoration: BoxDecoration(
                                              color: AppColors.glassHighlight,
                                              borderRadius: BorderRadius.circular(12),
                                            ),
                                            child: const Text(
                                              'Cancel',
                                              textAlign: TextAlign.center,
                                              style: TextStyle(
                                                color: AppColors.textPrimary,
                                                fontSize: 14,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: AnimatedScaleButton(
                                          onPress: _delete,
                                          child: Container(
                                            padding: const EdgeInsets.symmetric(vertical: 12),
                                            decoration: BoxDecoration(
                                              color: AppColors.primaryAction,
                                              borderRadius: BorderRadius.circular(12),
                                            ),
                                            child: const Text(
                                              'Delete',
                                              textAlign: TextAlign.center,
                                              style: TextStyle(
                                                color: AppColors.primaryActionText,
                                                fontSize: 14,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            )
                          : AnimatedScaleButton(
                              onPress: () => setState(() => _confirmDelete = true),
                              child: Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(vertical: 14),
                                decoration: BoxDecoration(
                                  color: AppColors.dangerSubtle,
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(color: AppColors.dangerBorderLight, width: 1),
                                ),
                                child: const Text(
                                  'Delete Person',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: AppColors.primaryAction,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  static String _sinceLabel(int createdAtMs) {
    final dt = DateTime.fromMillisecondsSinceEpoch(createdAtMs);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[dt.month - 1]} ${dt.year}';
  }
}

class _StatCell extends StatelessWidget {
  const _StatCell({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _EditField extends StatelessWidget {
  const _EditField({required this.controller, required this.label, this.maxLines = 1});

  final TextEditingController controller;
  final String label;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      style: const TextStyle(color: AppColors.textInput, fontSize: 15),
      cursorColor: AppColors.primaryAction,
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: AppColors.textMuted, fontSize: 12),
        filled: true,
        fillColor: AppColors.surfaceOverlayLight,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.glassBorderSubtle),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.glassBorderSubtle),
        ),
      ),
    );
  }
}

class _RelationshipPicker extends StatelessWidget {
  const _RelationshipPicker({required this.selected, required this.onSelect});

  final String? selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final option in relationshipOptions)
          AnimatedScaleButton(
            onPress: () => onSelect(option),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(
                color: selected == option ? AppColors.dangerTint : AppColors.glassSurfaceSubtle,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: selected == option ? AppColors.dangerBorder : AppColors.glassBorderFaint,
                ),
              ),
              child: Text(
                option,
                style: TextStyle(
                  color: selected == option ? AppColors.primaryAction : AppColors.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _RecentNoteRow extends StatelessWidget {
  const _RecentNoteRow({required this.note, required this.onTap});

  final SavedNote note;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: AnimatedScaleButton(
        onPress: onTap,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.cardBackground,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.glassBorderFaint, width: 1),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  note.text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${note.wordCount}w',
                style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
