import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/database/db.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/ui/core/widgets/settings_primitives.dart';
import 'package:mda_flutter/ui/features/settings/backup_scope_picker.dart';
import 'package:mda_flutter/ui/features/settings/settings_modal.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _SettingsStorage extends StorageNotifier {
  @override
  AppData build() => const AppData(
    isLoaded: true,
    preferences: PreferencesState(lockTimeoutMins: 0),
  );
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    setPrefsAccess(() async => {}, (key, value) async {});
  });

  testWidgets('backup defaults to all scopes and permits a combined subset', (
    tester,
  ) async {
    List<String>? selected;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              selected = await showDialog<List<String>>(
                context: context,
                builder: (_) => const BackupScopePicker(),
              );
            },
            child: const Text('Open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.text('Export (4)'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('backup-scope-vlogs')));
    await tester.pump();
    await tester.tap(find.text('Export (3)'));
    await tester.pumpAndSettle();
    expect(selected, ['settings', 'notes', 'masteries']);
  });

  testWidgets('empty backup selection disables export', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: BackupScopePicker()));
    for (final scope in ['settings', 'notes', 'masteries', 'vlogs']) {
      await tester.tap(find.byKey(ValueKey('backup-scope-$scope')));
      await tester.pump();
    }
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
  });

  testWidgets('settings fit a narrow phone with increased text size', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [appDataProvider.overrideWith(_SettingsStorage.new)],
        child: MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(
              size: Size(320, 740),
              textScaler: TextScaler.linear(1.3),
            ),
            child: Scaffold(
              body: Padding(
                padding: const EdgeInsets.all(20),
                child: SettingsModal(onClose: () {}),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.text('Immediate'), findsOneWidget);
    await tester.ensureVisible(find.text('Inactivity Lock'));
    await tester.tap(find.text('Inactivity Lock'));
    await tester.pumpAndSettle();
    expect(find.text('Immediately'), findsOneWidget);
    expect(find.text('15 Minutes'), findsOneWidget);
    expect(find.text('Off'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('toggle has a full touch target and responds once', (
    tester,
  ) async {
    var changes = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Center(
          child: SettingsToggle(value: false, onChanged: (_) => changes++),
        ),
      ),
    );
    expect(tester.getSize(find.byType(SettingsToggle)), const Size(48, 48));
    await tester.tapAt(
      tester.getTopLeft(find.byType(SettingsToggle)) + const Offset(2, 2),
    );
    expect(changes, 1);
  });
}
