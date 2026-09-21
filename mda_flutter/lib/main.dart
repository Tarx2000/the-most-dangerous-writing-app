/// Entry point — mirrors `index.ts`/`App.tsx` of the RN app.
///
/// Startup order:
///   1. Flutter binding (fonts/splash handled natively)
///   2. System UI: status bar hidden, portrait lock, black nav bar
///   3. Haptics backend init (best-effort)
///   4. ProviderScope + App (storage boot runs in the background —
///      the UI never waits for data before first frame)
library;

import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/haptics.dart';
import 'core/logger.dart';
import 'marionette_harness.dart' as marionette;

/// `true` inside `flutter test` (test binding owns the process — Marionette
/// must NOT initialize there; single-binding rule, see marionette_harness).
bool get _isFlutterTest => Platform.environment.containsKey('FLUTTER_TEST');

Future<void> main() async {
  // Debug-only Marionette binding FIRST (before any plugin can claim the
  // binding). Release/test builds get the stock binding — zero ship impact.
  // NOTE: the container is created lazily — only on the debug path — so
  // release/test builds never pay for (or leak) an unused container.
  late final ProviderContainer debugContainer = ProviderContainer();
  if (kDebugMode && !_isFlutterTest) {
    marionette.ensureMarionette(debugContainer);
  } else {
    WidgetsFlutterBinding.ensureInitialized();
  }

  // Status bar hidden everywhere (RN parity); black nav bar; portrait only.
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  await SystemChrome.setEnabledSystemUIMode(
    SystemUiMode.manual,
    overlays: [SystemUiOverlay.bottom],
  );
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarBrightness: Brightness.dark,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: Color(0xFF000000),
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  await initHaptics().catchError((Object e) {
    logStartup.warn('haptics init skipped', e);
    return null;
  });

  // The debug container is shared with the Marionette test extensions so
  // they operate on the same state the UI renders (UncontrolledProviderScope
  // = "use this exact container instead of creating one").
  if (kDebugMode && !_isFlutterTest) {
    runApp(
      UncontrolledProviderScope(
        container: debugContainer,
        child: const MdaApp(),
      ),
    );
  } else {
    runApp(const ProviderScope(child: MdaApp()));
  }
}
