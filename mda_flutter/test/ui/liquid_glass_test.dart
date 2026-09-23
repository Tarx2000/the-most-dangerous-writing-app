import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:liquid_glass_easy/liquid_glass_easy.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/database/db.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/data/services/settings_service.dart';
import 'package:mda_flutter/ui/core/widgets/confirm_dialog.dart';
import 'package:mda_flutter/ui/core/widgets/liquid_glass_nav.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeStorageNotifier extends StorageNotifier {
  _FakeStorageNotifier({required bool enableLiquidGlass})
      : _initialGlass = enableLiquidGlass;

  final bool _initialGlass;

  @override
  AppData build() {
    return AppData(
      isLoaded: true,
      preferences: PreferencesState(
        enableLiquidGlass: _initialGlass,
      ),
    );
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    setPrefsAccess(() async => {}, (key, value) async {});
  });

  test('SettingsKeys contains enableLiquidGlass', () {
    expect(SettingsKeys.enableLiquidGlass, 'ENABLE_LIQUID_GLASS');
  });

  testWidgets('LiquidGlassNav renders classic container when liquid glass is disabled', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appDataProvider.overrideWith(
            () => _FakeStorageNotifier(enableLiquidGlass: false),
          ),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: Stack(
              children: [
                LiquidGlassNav(
                  tabs: defaultNavTabs(checkinUrgent: false),
                  activeId: 'journal',
                  onSelect: (_) {},
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    // When disabled, no LiquidGlassLens should be rendered
    expect(find.byType(LiquidGlassLens), findsNothing);
    expect(find.byType(LiquidGlassNav), findsOneWidget);
  });

  testWidgets('LiquidGlassNav renders LiquidGlassLens when liquid glass is enabled', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appDataProvider.overrideWith(
            () => _FakeStorageNotifier(enableLiquidGlass: true),
          ),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: Stack(
              children: [
                LiquidGlassNav(
                  tabs: defaultNavTabs(checkinUrgent: false),
                  activeId: 'journal',
                  onSelect: (_) {},
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    // When enabled, LiquidGlassLens must be rendered
    expect(find.byType(LiquidGlassLens), findsOneWidget);
    expect(find.byType(LiquidGlassNav), findsOneWidget);
  });

  testWidgets('ConfirmDialog renders classic Container when disabled', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appDataProvider.overrideWith(
            () => _FakeStorageNotifier(enableLiquidGlass: false),
          ),
        ],
        child: MaterialApp(
          home: ConfirmDialog(
            title: 'Delete Note',
            message: 'Are you sure?',
            onConfirm: () {},
            onCancel: () {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(LiquidGlassLens), findsNothing);
    expect(find.byType(ConfirmDialog), findsOneWidget);
  });

  testWidgets('ConfirmDialog renders LiquidGlassLens when enabled', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appDataProvider.overrideWith(
            () => _FakeStorageNotifier(enableLiquidGlass: true),
          ),
        ],
        child: MaterialApp(
          home: ConfirmDialog(
            title: 'Delete Note',
            message: 'Are you sure?',
            onConfirm: () {},
            onCancel: () {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(LiquidGlassLens), findsOneWidget);
    expect(find.byType(ConfirmDialog), findsOneWidget);
  });

  test('PreferencesState copyWith updates enableLiquidGlass', () {
    const prefs = PreferencesState(enableLiquidGlass: false);
    final updated = prefs.copyWith(enableLiquidGlass: true);
    expect(updated.enableLiquidGlass, isTrue);
    final disabledAgain = updated.copyWith(enableLiquidGlass: false);
    expect(disabledAgain.enableLiquidGlass, isFalse);
  });
}
