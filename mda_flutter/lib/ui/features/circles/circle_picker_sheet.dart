/// CirclePickerSheet — person selection for circles mode (port of
/// `CirclePickerSheet.tsx`, SPEC §15). Unified search + create flow:
///  - Top search bar filters and ranks matching persons (best matches first).
///  - When matches exist, "Add Person" appears as the bottom-most option.
///  - When no matches exist, only "Add Person" is shown.
///  - Tapping "Add Person" asks for confirmation ("Yes") and directly creates
///    the person using the current search bar text without an extra input modal.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/models/person.dart';
import '../../../data/providers.dart';
import '../../../data/security_providers.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/base_modal.dart';
import '../../core/widgets/confirm_dialog.dart';
import '../../core/widgets/rating_unlock.dart';

/// Shows the circle picker; resolves with the selected person id (or null).
Future<String?> showCirclePicker(BuildContext context, {String? selectedId}) {
  final completer = Completer<String?>();
  showBaseModal(
    context,
    title: 'Choose a Person',
    heightFactor: 0.75,
    builder: (close) => CirclePickerBody(
      selectedId: selectedId,
      onSelect: (id) {
        if (completer.isCompleted) return;
        vibrate(HapticPatterns.optionSelect);
        close();
        completer.complete(id);
      },
    ),
  ).then((_) {
    if (!completer.isCompleted) completer.complete(null);
  });
  return completer.future;
}

class CirclePickerBody extends ConsumerStatefulWidget {
  const CirclePickerBody({
    super.key,
    required this.selectedId,
    required this.onSelect,
  });

  final String? selectedId;
  final ValueChanged<String> onSelect;

  @override
  ConsumerState<CirclePickerBody> createState() => _CirclePickerBodyState();
}

class _CirclePickerBodyState extends ConsumerState<CirclePickerBody> {
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      final next = _searchController.text;
      if (next != _query) {
        setState(() => _query = next);
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  /// Ranks and filters [persons] against [rawQuery] so the best matches appear
  /// at the top of the list.
  static List<Person> _rankMatches(List<Person> persons, String rawQuery) {
    final q = rawQuery.trim().toLowerCase();
    if (q.isEmpty) return persons;

    final scored = <({Person person, int tier, int pos})>[];
    for (final person in persons) {
      final name = person.name.toLowerCase();
      final display = person.displayName.toLowerCase();
      final nick = (person.nickname ?? '').toLowerCase();

      int? tier;
      var pos = 0;

      if (name == q || display == q || (nick.isNotEmpty && nick == q)) {
        tier = 0; // Exact match
      } else if (name.startsWith(q) ||
          display.startsWith(q) ||
          (nick.isNotEmpty && nick.startsWith(q))) {
        tier = 1; // Prefix match
      } else {
        // Word-boundary prefix match (e.g. last name starts with query)
        final words = '$name $display $nick'.split(RegExp(r'\s+'));
        if (words.any((w) => w.startsWith(q))) {
          tier = 2;
        } else {
          final nameIdx = name.indexOf(q);
          final displayIdx = display.indexOf(q);
          final nickIdx = nick.isEmpty ? -1 : nick.indexOf(q);
          final indices = [
            if (nameIdx >= 0) nameIdx,
            if (displayIdx >= 0) displayIdx,
            if (nickIdx >= 0) nickIdx,
          ];
          if (indices.isNotEmpty) {
            tier = 3; // Substring match
            pos = indices.reduce((a, b) => a < b ? a : b);
          }
        }
      }

      if (tier != null) {
        scored.add((person: person, tier: tier, pos: pos));
      }
    }

    scored.sort((a, b) {
      final tierCmp = a.tier.compareTo(b.tier);
      if (tierCmp != 0) return tierCmp;
      final posCmp = a.pos.compareTo(b.pos);
      if (posCmp != 0) return posCmp;
      return a.person.displayName.toLowerCase().compareTo(
        b.person.displayName.toLowerCase(),
      );
    });

    return [for (final entry in scored) entry.person];
  }

  Future<void> _handleAddPerson() async {
    final trimmed = _query.trim();
    if (trimmed.isEmpty) {
      _searchFocusNode.requestFocus();
      return;
    }

    final confirmed = await showConfirmDialog(
      context,
      title: 'Add Person',
      message: 'Add "$trimmed" to your circles?',
      confirmLabel: 'Yes',
      cancelLabel: 'Cancel',
    );
    if (!confirmed || !mounted) return;

    final id = await ref.read(appDataProvider.notifier).addPerson(trimmed);
    if (id != null && mounted) {
      widget.onSelect(id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final persons = ref.watch(personsProvider);
    final isUnlocked = ref.watch(
      securityControllerProvider.select((c) => c.isCirclesUnlocked),
    );
    if (!isUnlocked) {
      return VaultLockCard(
        title: 'Circles are locked',
        subtitle: 'Verify your identity to choose a person.',
        buttonLabel: 'Unlock',
        onUnlock: () {
          final prefs = ref.read(preferencesProvider);
          ref
              .read(securityControllerProvider)
              .unlockCircles(
                preferPinAuth: prefs.preferPinAuth,
                useBiometrics: prefs.useBiometrics,
                lockTimeoutMins: prefs.lockTimeoutMins,
              );
        },
      );
    }

    final trimmedQuery = _query.trim();
    final hasQuery = trimmedQuery.isNotEmpty;
    final matches = _rankMatches(persons, trimmedQuery);
    // Show "Add Person" at the bottom when searching (or when no persons exist yet).
    final showAddRow = hasQuery || persons.isEmpty;

    return Column(
      children: [
        // Top Search Bar (unified search + create input)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.glassSurfaceSubtle,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.glassBorder, width: 1),
            ),
            child: Row(
              children: [
                Icon(
                  Mdi.get('magnify'),
                  color: AppColors.textSecondary,
                  size: 20,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    focusNode: _searchFocusNode,
                    style: const TextStyle(
                      color: AppColors.textInput,
                      fontSize: 16,
                    ),
                    cursorColor: AppColors.primaryAction,
                    textInputAction: TextInputAction.search,
                    decoration: const InputDecoration(
                      hintText: 'Search or add a person...',
                      hintStyle: TextStyle(color: AppColors.placeholder),
                      border: InputBorder.none,
                    ),
                    onSubmitted: (_) {
                      if (hasQuery && matches.isEmpty) {
                        _handleAddPerson();
                      }
                    },
                  ),
                ),
                if (_query.isNotEmpty)
                  GestureDetector(
                    onTap: () => _searchController.clear(),
                    child: Padding(
                      padding: const EdgeInsets.all(4),
                      child: Icon(
                        Mdi.get('close'),
                        color: AppColors.textMuted,
                        size: 18,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        // Matches list + bottom "Add Person" option
        Expanded(
          child: ListView.builder(
            padding: EdgeInsets.fromLTRB(
              16,
              0,
              16,
              MediaQuery.paddingOf(context).bottom + 20,
            ),
            itemCount: matches.length + (showAddRow ? 1 : 0),
            itemBuilder: (context, index) {
              if (index < matches.length) {
                final person = matches[index];
                final active = person.id == widget.selectedId;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: AnimatedScaleButton(
                    onPress: () => widget.onSelect(person.id),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: active
                            ? AppColors.dangerTint
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 36,
                            height: 36,
                            alignment: Alignment.center,
                            decoration: const BoxDecoration(
                              color: AppColors.glassHighlight,
                              shape: BoxShape.circle,
                            ),
                            child: Text(
                              person.name.isEmpty
                                  ? '?'
                                  : person.name[0].toUpperCase(),
                              style: const TextStyle(
                                color: AppColors.textPrimary,
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              person.displayName,
                              style: TextStyle(
                                color: active
                                    ? AppColors.primaryAction
                                    : AppColors.textPrimary,
                                fontSize: 16,
                                fontWeight: active
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                              ),
                            ),
                          ),
                          Icon(
                            active ? Mdi.get('check') : Mdi.get('chevronRight'),
                            size: 20,
                            color: active
                                ? AppColors.primaryAction
                                : AppColors.textMuted,
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }

              // Bottom-most option: "Add Person"
              return Padding(
                padding: EdgeInsets.only(top: matches.isEmpty ? 2 : 6),
                child: AnimatedScaleButton(
                  onPress: _handleAddPerson,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 13,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.glassSurfaceSubtle,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: AppColors.glassBorder,
                        width: 1,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Mdi.get('accountPlusOutline'),
                          color: AppColors.primaryAction,
                          size: 22,
                        ),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Text(
                            'Add Person',
                            style: TextStyle(
                              color: AppColors.textPrimary,
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        if (hasQuery)
                          Flexible(
                            child: Text(
                              '"$trimmedQuery"',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: AppColors.textSecondary,
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
