/// Back must dismiss the top interaction without exiting the app or exposing
/// private content. In particular, the global PIN pad lives above Navigator.
library;

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/app.dart';
import 'package:mda_flutter/data/app_data.dart';
import 'package:mda_flutter/data/providers.dart';
import 'package:mda_flutter/data/security_providers.dart';
import 'package:mda_flutter/data/services/secure_storage_service.dart';
import 'package:mda_flutter/domain/use_cases/security_controller.dart';
import 'package:mda_flutter/ui/core/widgets/base_modal.dart';

class _LoadedStorage extends StorageNotifier {
  @override
  AppData build() => const AppData(isLoaded: true);
}

class _EmptySecureStorage extends SecureStorageService {
  @override
  Future<String?> readPin() async => null;

  @override
  Future<int> readAttemptCount() async => 0;

  @override
  Future<int> readLockoutUntil() async => 0;
}

void main() {
  testWidgets('root PIN tells Android to send Back to Flutter', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    final reports = <bool>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'SystemNavigator.setFrameworkHandlesBack') {
          reports.add(call.arguments as bool);
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );
    final security = SecurityController(storage: _EmptySecureStorage());
    goRouter.go('/');
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appDataProvider.overrideWith(_LoadedStorage.new),
          securityControllerProvider.overrideWith((ref) => security),
        ],
        child: const MdaApp(),
      ),
    );
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    final pin = security.requestPin();
    await tester.pumpAndSettle();
    expect(
      reports.last,
      isTrue,
      reason: 'without this Android exits before Dart can cancel PIN',
    );
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(await pin, isFalse);
    expect(reports.last, isFalse);
    expect(find.text('Free Writing').hitTestable(), findsOneWidget);
    // Reset before the framework's foundation-var check (tearDown runs after
    // verification, so leaving the override set fails the test body).
    debugDefaultTargetPlatformOverride = null;
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Back dismisses a sheet and preserves the underlying route', (
    tester,
  ) async {
    late BuildContext homeContext;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            homeContext = context;
            return const Scaffold(body: Text('Underlying screen'));
          },
        ),
      ),
    );
    var completed = false;
    final closing = showBaseModal(
      homeContext,
      title: 'Settings sheet',
      builder: (_) => const Text('Sheet content'),
    ).then((_) => completed = true);
    await tester.pumpAndSettle();
    expect(find.text('Sheet content').hitTestable(), findsOneWidget);

    await tester.binding.handlePopRoute();
    // Back follows the sheet's own exit animation before removing its route.
    expect(completed, isFalse);
    await tester.pumpAndSettle();
    await closing;
    expect(completed, isTrue);
    expect(find.text('Sheet content'), findsNothing);
    expect(find.text('Underlying screen').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Back closes only the top sheet when sheets are nested', (
    tester,
  ) async {
    late BuildContext homeContext;
    late BuildContext firstSheetContext;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            homeContext = context;
            return const Scaffold(body: Text('Home'));
          },
        ),
      ),
    );
    final first = showBaseModal(
      homeContext,
      builder: (_) => Builder(
        builder: (context) {
          firstSheetContext = context;
          return const Text('First sheet');
        },
      ),
    );
    await tester.pumpAndSettle();
    final second = showBaseModal(
      firstSheetContext,
      builder: (_) => const Text('Second sheet'),
    );
    await tester.pumpAndSettle();

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    await second;
    expect(find.text('Second sheet'), findsNothing);
    expect(find.text('First sheet').hitTestable(), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    await first;
    expect(find.text('First sheet'), findsNothing);
    expect(find.text('Home').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Back cancels global PIN before dismissing the sheet below it', (
    tester,
  ) async {
    final security = SecurityController(storage: _EmptySecureStorage());
    goRouter.go('/');
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appDataProvider.overrideWith(_LoadedStorage.new),
          securityControllerProvider.overrideWith((ref) => security),
        ],
        child: const MdaApp(),
      ),
    );
    await tester.pumpAndSettle();
    final sheet = showBaseModal(
      tester.element(find.text('Free Writing')),
      builder: (_) => const Text('Protected action sheet'),
    );
    await tester.pumpAndSettle();
    final pin = security.requestPin();
    await tester.pumpAndSettle();
    expect(security.mode.value, PinPadMode.setup1);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(await pin, isFalse);
    expect(security.mode.value, isNull);
    expect(security.isNotesUnlocked, isFalse);
    expect(find.text('Protected action sheet').hitTestable(), findsOneWidget);

    // Once PIN is gone, the dispatcher must delegate Back to Navigator again.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    await sheet;
    expect(find.text('Protected action sheet'), findsNothing);
    expect(find.text('Free Writing').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
