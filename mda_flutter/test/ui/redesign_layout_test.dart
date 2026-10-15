import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/ui/features/start/start_screen.dart';

class _Storage extends StorageNotifier {
  _Storage(this.glass);
  final bool glass;
  @override
  AppData build() => AppData(
    isLoaded: true,
    preferences: PreferencesState(enableLiquidGlass: glass),
  );
}

void main() {
  for (final glass in [false, true]) {
    for (final scale in [1.0, 1.6]) {
      for (final mode in SessionMode.values) {
        testWidgets('320×640, text $scale, glass $glass, $mode', (
          tester,
        ) async {
          tester.view.physicalSize = const Size(320, 640);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          await tester.pumpWidget(
            ProviderScope(
              overrides: [appDataProvider.overrideWith(() => _Storage(glass))],
              child: MaterialApp(
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(
                    context,
                  ).copyWith(textScaler: TextScaler.linear(scale)),
                  child: child!,
                ),
                home: Scaffold(body: StartScreen(mode: mode)),
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox());
        });
      }
    }
  }
}
