import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:liquid_glass_easy/liquid_glass_easy.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/database/db.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/data/services/settings_service.dart';
import 'package:mda_flutter/ui/core/widgets/confirm_dialog.dart';
import 'package:mda_flutter/ui/core/widgets/liquid_glass_nav.dart';
import 'package:mda_flutter/ui/features/start/start_screen.dart';
import 'package:mda_flutter/ui/core/widgets/tick_dial.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeStorageNotifier extends StorageNotifier {
  _FakeStorageNotifier({required bool enableLiquidGlass})
    : _initialGlass = enableLiquidGlass;

  final bool _initialGlass;

  void setGlass(bool enabled) {
    state = state.copyWith(
      preferences: state.preferences.copyWith(enableLiquidGlass: enabled),
    );
  }

  @override
  AppData build() {
    return AppData(
      isLoaded: true,
      preferences: PreferencesState(enableLiquidGlass: _initialGlass),
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

  for (final glass in [false, true]) {
    for (final size in [const Size(375, 812), const Size(402, 874)]) {
      testWidgets('all start modes remain visible at $size, glass=$glass', (
        tester,
      ) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        tester.view.padding = const FakeViewPadding(top: 62, bottom: 34);
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.view.resetPadding);
        final container = ProviderContainer(
          overrides: [
            appDataProvider.overrideWith(
              () => _FakeStorageNotifier(enableLiquidGlass: glass),
            ),
          ],
        );
        addTearDown(container.dispose);
        for (final mode in SessionMode.values) {
          await tester.pumpWidget(
            UncontrolledProviderScope(
              container: container,
              child: MaterialApp(
                home: Scaffold(body: StartScreen(mode: mode)),
              ),
            ),
          );
          await tester.pump();
          expect(tester.takeException(), isNull, reason: '$mode');
          expect(
            find.byType(TickDial).hitTestable(),
            mode == SessionMode.checkin ? findsNothing : findsOneWidget,
          );
          expect(
            find
                .text(
                  mode == SessionMode.vlog
                      ? 'Start Recording'
                      : mode == SessionMode.checkin
                      ? 'Continue check-in'
                      : 'Start Writing',
                )
                .hitTestable(),
            findsOneWidget,
          );
          expect(
            find.ancestor(
              of: find.text(
                mode == SessionMode.vlog
                    ? 'Start Recording'
                    : mode == SessionMode.checkin
                    ? 'Continue check-in'
                    : 'Start Writing',
              ),
              matching: find.byType(LiquidGlassButton),
            ),
            glass ? findsOneWidget : findsNothing,
          );
        }
        await tester.pumpWidget(const SizedBox());
      });
    }
  }

  testWidgets('switching glass mode keeps the selected duration', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final storage = _FakeStorageNotifier(enableLiquidGlass: false);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [appDataProvider.overrideWith(() => storage)],
        child: const MaterialApp(home: Scaffold(body: StartScreen())),
      ),
    );
    await tester.pump();
    await tester.tap(find.text('HARD'));
    tester.widget<TickDial>(find.byType(TickDial)).onSelect(3);
    await tester.pump(const Duration(milliseconds: 300));
    storage.setGlass(true);
    await tester.pump();
    expect(
      find.ancestor(
        of: find.text('Start Writing'),
        matching: find.byType(LiquidGlassButton),
      ),
      findsOneWidget,
    );
    expect(
      find.ancestor(
        of: find.text('New Tweet'),
        matching: find.byType(LiquidGlassButton),
      ),
      findsOneWidget,
    );
    expect(tester.widget<TickDial>(find.byType(TickDial)).selectedIndex, 3);
    storage.setGlass(false);
    await tester.pump();
    expect(find.byType(LiquidGlassButton), findsNothing);
    expect(tester.widget<TickDial>(find.byType(TickDial)).selectedIndex, 3);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'glass start screen lays out and starts the selected difficulty',
    (tester) async {
      tester.view.physicalSize = const Size(402, 874);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      Map<String, dynamic>? started;
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (_, _) => const Scaffold(body: StartScreen()),
          ),
          GoRoute(
            path: '/writing',
            builder: (_, state) {
              started = (state.extra as Map).cast<String, dynamic>();
              return const Scaffold(body: Text('Writing opened'));
            },
          ),
        ],
      );
      addTearDown(router.dispose);
      final storage = _FakeStorageNotifier(enableLiquidGlass: true);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [appDataProvider.overrideWith(() => storage)],
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(find.text('Free Writing').hitTestable(), findsOneWidget);
      await tester.tap(find.text('HARD'));
      await tester.pump(const Duration(milliseconds: 250));
      storage.setGlass(false);
      await tester.pump();
      storage.setGlass(true);
      await tester.pump();
      await tester.tap(find.text('Start Writing'));
      await tester.pumpAndSettle();
      expect(started?['diffIndex'], 2);
      expect(started?['mode'], 'journal');
      expect(find.text('Writing opened'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'LiquidGlassNav renders classic container when liquid glass is disabled',
    (tester) async {
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
    },
  );

  testWidgets(
    'LiquidGlassNav renders LiquidGlassLens when liquid glass is enabled',
    (tester) async {
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
    },
  );

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
