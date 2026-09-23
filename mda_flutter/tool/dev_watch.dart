import 'dart:async';
import 'dart:io';

/// Configuration constants for watcher behavior (Rule 3)
const Duration kDebounceDuration = Duration(milliseconds: 400);
const String kWatchedDirectory = 'lib';
const Set<String> kWatchedExtensions = {'.dart', '.glsl'};

/// A wrapper runner for `flutter run` that continuously watches the `lib/` directory.
///
/// WHY THIS EXISTS:
/// When AI coding agents (Antigravity, Cursor, OpenCode) edit files directly on disk,
/// standard editor "hotReloadOnSave" doesn't trigger because the editor didn't receive
/// a human `Cmd + S` event in an active editor tab.
///
/// This script bridges the gap: it watches file system modifications in real-time,
/// debounces them, and sends `r` directly to Flutter's stdin so changes made by
/// any agent or tool appear instantly on the connected Android emulator.
Future<void> main(List<String> args) async {
  stdout.writeln('====================================================');
  stdout.writeln('🚀 MDA Auto-Watch Flutter Runner (Agent & Live Preview)');
  stdout.writeln('   Watching $kWatchedDirectory/ for changes (AI edits & saves)');
  stdout.writeln('====================================================\n');

  Directory workDir = Directory.current;
  if (!File('${workDir.path}/pubspec.yaml').existsSync()) {
    final sub = Directory('${workDir.path}/mda_flutter');
    if (sub.existsSync() && File('${sub.path}/pubspec.yaml').existsSync()) {
      workDir = sub;
    }
  }

  final flutterArgs = ['run', ...args];

  stdout.writeln('Starting: flutter ${flutterArgs.join(' ')} in ${workDir.path}...\n');

  final process = await Process.start(
    'flutter',
    flutterArgs,
    workingDirectory: workDir.path,
    mode: ProcessStartMode.normal,
  );

  // Pipe stdout and stderr directly
  process.stdout.listen((data) => stdout.add(data));
  process.stderr.listen((data) => stderr.add(data));

  // Forward manual user input from terminal stdin (e.g. 'r', 'R', 'q', 'p')
  final stdinSubscription = stdin.listen((data) {
    process.stdin.add(data);
  });

  Timer? debounceTimer;
  bool isReadyForHotReload = false;

  // Allow app initial build and startup before sending reloads
  Future.delayed(const Duration(seconds: 5), () {
    isReadyForHotReload = true;
  });

  final watchDir = Directory('${workDir.path}/$kWatchedDirectory');
  StreamSubscription<FileSystemEvent>? watchSub;

  if (watchDir.existsSync()) {
    watchSub = watchDir.watch(recursive: true).listen((event) {
      final path = event.path;
      final ext = path.contains('.') ? path.substring(path.lastIndexOf('.')) : '';
      if (!kWatchedExtensions.contains(ext)) return;

      if (!isReadyForHotReload) return;

      debounceTimer?.cancel();
      debounceTimer = Timer(kDebounceDuration, () {
        final filename = path.split(Platform.pathSeparator).last;
        stdout.writeln('\n⚡ [Agent/Auto-Watch] File changed: $filename -> Triggering Hot Reload...');
        process.stdin.writeln('r');
      });
    });
  } else {
    stdout.writeln('⚠️ Warning: ${watchDir.path} does not exist for watching.');
  }

  // Handle clean shutdown on Ctrl+C (SIGINT)
  ProcessSignal.sigint.watch().listen((_) async {
    stdout.writeln('\nShutting down Flutter runner...');
    await watchSub?.cancel();
    await stdinSubscription.cancel();
    process.stdin.writeln('q');
    Timer(const Duration(seconds: 2), () {
      process.kill();
    });
  });

  final exitCode = await process.exitCode;
  await watchSub?.cancel();
  await stdinSubscription.cancel();
  exit(exitCode);
}
