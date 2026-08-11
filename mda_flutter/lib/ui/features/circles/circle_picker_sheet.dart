/// CirclePickerSheet — person selection for circles mode (port of
/// `CirclePickerSheet.tsx`, SPEC §15). List of persons with check marks +
/// an "add person" entry; resolves with the selected person id.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/providers.dart';
import '../../core/widgets/animated_scale_button.dart';
import '../../core/widgets/base_modal.dart';

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

class CirclePickerBody extends ConsumerWidget {
  const CirclePickerBody({super.key, required this.selectedId, required this.onSelect});

  final String? selectedId;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final persons = ref.watch(personsProvider);

    return Column(
      children: [
        // Add person row
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: AnimatedScaleButton(
            onPress: () async {
              final name = await _promptForName(context);
              if (name != null && name.trim().isNotEmpty) {
                final id = await ref.read(appDataProvider.notifier).addPerson(name.trim());
                if (id != null) onSelect(id);
              }
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
              decoration: BoxDecoration(
                color: AppColors.glassSurfaceSubtle,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.glassBorder, width: 1),
              ),
              child: Row(
                children: [
                  Icon(Mdi.get('accountPlusOutline'), color: AppColors.primaryAction, size: 22),
                  const SizedBox(width: 12),
                  const Text(
                    'Add Person',
                    style: TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        // Person list
        Expanded(
          child: persons.isEmpty
              ? const Center(
                  child: Text(
                    'No persons yet — add your first circle.',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 14),
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: persons.length,
                  itemBuilder: (context, index) {
                    final person = persons[index];
                    final active = person.id == selectedId;
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: AnimatedScaleButton(
                        onPress: () => onSelect(person.id),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          decoration: BoxDecoration(
                            color: active ? AppColors.dangerTint : Colors.transparent,
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
                                  person.name.isEmpty ? '?' : person.name[0].toUpperCase(),
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
                                    color: active ? AppColors.primaryAction : AppColors.textPrimary,
                                    fontSize: 16,
                                    fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                                  ),
                                ),
                              ),
                              Icon(
                                active ? Mdi.get('check') : Mdi.get('chevronRight'),
                                size: 20,
                                color: active ? AppColors.primaryAction : AppColors.textMuted,
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

  /// Small inline name prompt (text field + save in a mini sheet).
  Future<String?> _promptForName(BuildContext context) {
    final controller = TextEditingController();
    final completer = Completer<String?>();
    showBaseModal(
      context,
      title: 'New Person',
      heightFactor: 0.35,
      builder: (close) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          children: [
            TextField(
              controller: controller,
              autofocus: true,
              style: const TextStyle(color: AppColors.textInput, fontSize: 16),
              cursorColor: AppColors.primaryAction,
              decoration: const InputDecoration(
                hintText: 'Name',
                hintStyle: TextStyle(color: AppColors.placeholder),
                border: InputBorder.none,
              ),
              onSubmitted: (_) {
                close();
                completer.complete(controller.text);
              },
            ),
            const SizedBox(height: 12),
            AnimatedScaleButton(
              onPress: () {
                close();
                completer.complete(controller.text);
              },
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 13),
                decoration: BoxDecoration(
                  color: AppColors.primaryAction,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Text(
                  'ADD',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.primaryActionText,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ).then((_) {
      if (!completer.isCompleted) completer.complete(null);
    });
    return completer.future;
  }
}
