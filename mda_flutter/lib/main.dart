/// Entry point — mirrors `index.ts`/`App.tsx` of the RN app.
///
/// Startup order:
///   1. Flutter binding (fonts/splash handled natively)
///   2. System UI: status bar hidden, portrait lock, black nav bar
///   3. Haptics backend init (best-effort)
///   4. ProviderScope + App (storage boot runs in the background —
///      the UI never waits for data before first frame)
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/haptics.dart';
import 'core/logger.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

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

  runApp(const ProviderScope(child: MdaApp()));
}
