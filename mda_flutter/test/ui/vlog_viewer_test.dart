/// Exercise the native-player boundary without opening real files or textures.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
// The video_player plugin's transitive interface is used only as a test seam.
// ignore: depend_on_referenced_packages
import 'package:video_player_platform_interface/video_player_platform_interface.dart';
import 'package:mda_flutter/core/theme/mdi.dart';
import 'package:mda_flutter/data/models/saved_vlog.dart';
import 'package:mda_flutter/ui/features/vlogs/vlog_viewer_modal.dart';

class _VideoPlatform extends VideoPlayerPlatform {
  final streams = <int, StreamController<VideoEvent>>{};
  final volumes = <int, double>{};
  final positions = <int, Duration>{};
  final playing = <int, bool>{};
  final playCalls = <int>[];
  final disposed = <int>[];

  @override
  Future<void> init() async {}

  @override
  Future<int?> createWithOptions(VideoCreationOptions options) async {
    final id = streams.length;
    streams[id] = StreamController<VideoEvent>(onCancel: () async {});
    return id;
  }

  void ready(int id) => streams[id]!.add(
    VideoEvent(
      eventType: VideoEventType.initialized,
      duration: const Duration(seconds: 30),
      size: const Size(900, 1600),
    ),
  );

  @override
  Stream<VideoEvent> videoEventsFor(int playerId) => streams[playerId]!.stream;

  @override
  Future<void> dispose(int playerId) async => disposed.add(playerId);

  @override
  Future<void> play(int playerId) async {
    playCalls.add(playerId);
    playing[playerId] = true;
  }

  @override
  Future<void> pause(int playerId) async => playing[playerId] = false;

  @override
  Future<void> setVolume(int playerId, double volume) async =>
      volumes[playerId] = volume;

  @override
  Future<void> setLooping(int playerId, bool looping) async {}

  @override
  Future<void> setPlaybackSpeed(int playerId, double speed) async {}

  @override
  Future<void> setPreventsDisplaySleepDuringVideoPlayback(
    int playerId,
    bool preventsDisplaySleepDuringVideoPlayback,
  ) async {}

  @override
  Future<Duration> getPosition(int playerId) async =>
      positions[playerId] ?? Duration.zero;

  @override
  Future<void> seekTo(int playerId, Duration position) async =>
      positions[playerId] = position;

  @override
  Widget buildView(int playerId) =>
      ColoredBox(key: ValueKey('video-$playerId'), color: Colors.black);
}

const _vlogs = [
  SavedVlog(
    id: 'first',
    filePath: '/first.mp4',
    dateStr: '2026-09-17',
    timestamp: 1,
    durationSec: 30,
  ),
  SavedVlog(
    id: 'second',
    filePath: '/second.mp4',
    dateStr: '2026-09-17',
    timestamp: 2,
    durationSec: 30,
  ),
];

Future<void> _mount(WidgetTester tester) async {
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        home: VlogViewerModal(vlogs: _vlogs, onClose: () {}),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  late _VideoPlatform platform;
  late VideoPlayerPlatform original;
  setUp(() {
    original = VideoPlayerPlatform.instance;
    platform = _VideoPlatform();
    VideoPlayerPlatform.instance = platform;
  });
  tearDown(() {
    VideoPlayerPlatform.instance = original;
    for (final stream in platform.streams.values) {
      unawaited(stream.close());
    }
  });

  testWidgets('late initialization never plays the previous clip', (
    tester,
  ) async {
    await _mount(tester);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await tester.tap(find.byIcon(Mdi.get('chevronRight')));
    await tester.pump();
    platform.ready(1);
    await tester.pumpAndSettle();
    platform.ready(0);
    await tester.pump();
    expect(platform.playCalls, isNot(contains(0)));
    expect(platform.playing[1], isTrue);
    expect(platform.disposed, contains(0));
    expect(find.text('2/2'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('mute survives switching and duration counts down', (
    tester,
  ) async {
    await _mount(tester);
    platform.ready(0);
    await tester.pumpAndSettle();
    expect(find.text('00:30'), findsOneWidget);
    await tester.tap(find.byIcon(Mdi.get('volumeHigh')));
    await tester.pump();
    expect(platform.volumes[0], 0);
    await tester.tap(find.byIcon(Mdi.get('chevronRight')));
    await tester.pump();
    platform.ready(1);
    await tester.pumpAndSettle();
    expect(platform.volumes[1], 0);
    platform.positions[1] = const Duration(seconds: 12);
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    expect(find.text('00:18'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('background pauses and manual pause survives foregrounding', (
    tester,
  ) async {
    await _mount(tester);
    platform.ready(0);
    await tester.pumpAndSettle();
    expect(platform.playing[0], isTrue);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();
    expect(platform.playing[0], isFalse);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(platform.playing[0], isTrue);
    await tester.tap(find.byKey(const ValueKey('video-0')));
    await tester.pump();
    expect(platform.playing[0], isFalse);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(platform.playing[0], isFalse);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('failed native initialization leaves a readable error', (
    tester,
  ) async {
    await _mount(tester);
    platform.streams[0]!.addError(
      PlatformException(code: 'missing-video', message: 'Video unavailable'),
    );
    await tester.pumpAndSettle();
    expect(find.text('Video unavailable'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });
}
