/// VlogRecordingScreen — camera recording (SPEC §11).
/// Front camera · quality from prefs · 3-2-1 countdown · session countdown
/// (regular) or elapsed timer (quick video) · keep-awake · AppState
/// backgrounding stops the recording safely.
library;

import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../../core/config/app_config.dart';
import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../core/utils.dart';
import '../../../data/models/saved_vlog.dart';
import '../../../data/providers.dart';
import '../../core/widgets/animated_scale_button.dart';

class VlogRecordingScreen extends ConsumerStatefulWidget {
  const VlogRecordingScreen({super.key, required this.timeIndex, this.isQuickVideo = false});

  final int timeIndex;
  final bool isQuickVideo;

  @override
  ConsumerState<VlogRecordingScreen> createState() => _VlogRecordingScreenState();
}

enum _RecPhase { permission, countdown, recording, canStop }

class _VlogRecordingScreenState extends ConsumerState<VlogRecordingScreen> {
  CameraController? _camera;
  _RecPhase _phase = _RecPhase.permission;
  int _countdown = 3;
  int _elapsedSeconds = 0;
  int _remainingSeconds = 0;
  bool _recording = false;
  XFile? _tempFile;

  @override
  void initState() {
    super.initState();
    _setup();
  }

  Future<void> _setup() async {
    final prefs = ref.read(preferencesProvider);
    try {
      final cameras = await availableCameras();
      final front = cameras.where((c) => c.lensDirection == CameraLensDirection.front).firstOrNull;
      final controller = CameraController(
        front ?? cameras.first,
        _resolutionFor(prefs.vlogQuality),
        enableAudio: true,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      if (!mounted) return;
      setState(() => _camera = controller);
      await WakelockPlus.enable();
      await Future<void>.delayed(const Duration(milliseconds: permissionGrantedDelayMs));
      if (!mounted) return;
      setState(() => _phase = _RecPhase.countdown);
      _runCountdown();
    } catch (e) {
      if (mounted) context.pop();
    }
  }

  ResolutionPreset _resolutionFor(String quality) {
    switch (quality) {
      case '720p':
        return ResolutionPreset.high;
      case '2160p':
        return ResolutionPreset.ultraHigh;
      default:
        return ResolutionPreset.veryHigh; // 1080p
    }
  }

  void _runCountdown() {
    vibrate(50);
    Future.delayed(const Duration(seconds: 1), () {
      if (!mounted) return;
      if (_countdown > 1) {
        setState(() => _countdown--);
        _runCountdown();
      } else {
        vibrate(50);
        setState(() {
          _countdown = 0;
          _phase = _RecPhase.recording;
          if (widget.isQuickVideo) {
            _remainingSeconds = -1; // unlimited elapsed
          } else {
            final mins = vlogSessionOptionsMins[widget.timeIndex.clamp(0, vlogSessionOptionsMins.length - 1)];
            _remainingSeconds = mins * 60;
          }
        });
        _startRecording();
        _tickTimer();
      }
    });
  }

  void _tickTimer() {
    Future.delayed(const Duration(seconds: 1), () {
      if (!mounted || _phase == _RecPhase.permission) return;
      setState(() {
        if (widget.isQuickVideo) {
          _elapsedSeconds++;
        } else if (_remainingSeconds > 0) {
          _remainingSeconds--;
        }
      });
      if (!widget.isQuickVideo && _remainingSeconds == 0 && _phase == _RecPhase.recording) {
        vibrate(HapticPatterns.sessionEnd);
        setState(() => _phase = _RecPhase.canStop);
      } else {
        _tickTimer();
      }
    });
  }

  Future<void> _startRecording() async {
    final camera = _camera;
    if (camera == null || !camera.value.isInitialized) return;
    try {
      await camera.startVideoRecording();
      _recording = true;
    } catch (_) {}
  }

  Future<void> _stopRecording() async {
    final camera = _camera;
    if (camera == null || !_recording) return;
    try {
      _tempFile = await camera.stopVideoRecording();
      _recording = false;
    } catch (_) {}
  }

  Future<void> _cancel() async {
    if (_recording) await _stopRecording();
    final temp = _tempFile;
    if (temp != null) {
      final file = File(temp.path);
      if (await file.exists()) await file.delete();
    }
    await WakelockPlus.disable();
    if (mounted) context.pop();
  }

  Future<void> _save() async {
    await _stopRecording();
    final temp = _tempFile;
    if (temp == null || !mounted) return;

    final prefs = ref.read(preferencesProvider);
    final id = generateId();
    final docs = await getApplicationDocumentsDirectory();
    final vlogDir = Directory(p.join(docs.path, vlogStorageDir));
    await vlogDir.create(recursive: true);
    final permanentPath = p.join(vlogDir.path, '$id.mp4');

    final tempFile = File(temp.path);
    if (!await tempFile.exists()) {
      if (mounted) context.pop();
      return;
    }
    await tempFile.rename(permanentPath);

    final rawSize = await File(permanentPath).length();
    final preset = prefs.compressionPreset;
    final willCompress = preset != 'off';

    final vlog = SavedVlog(
      id: id,
      filePath: permanentPath,
      dateStr: toLocalDateString(DateTime.now()),
      timestamp: DateTime.now().millisecondsSinceEpoch,
      durationSec: widget.isQuickVideo ? _elapsedSeconds : vlogSessionOptionsMins[widget.timeIndex] * 60,
      fileSizeBytes: rawSize,
      compressionPreset: willCompress ? preset : 'off',
      originalFileSizeBytes: willCompress ? rawSize : null,
      compressionPending: willCompress,
    );
    await ref.read(appDataProvider.notifier).saveVlog(vlog);
    if (willCompress) {
      ref.read(compressionQueueManagerProvider).enqueueVlog(id, permanentPath, preset);
    }

    await WakelockPlus.disable();
    if (mounted) {
      vibrate(HapticPatterns.unlockSuccess);
      context.go('/');
    }
  }

  @override
  void dispose() {
    WakelockPlus.disable();
    _camera?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final camera = _camera;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        children: [
          // Camera preview
          if (camera != null && camera.value.isInitialized)
            Positioned.fill(
              child: CameraPreview(camera),
            ),
          // Dark overlay for legibility
          const Positioned.fill(
            child: ColoredBox(color: AppColors.overlaySubtle),
          ),
          // Header: close + timer
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  AnimatedScaleButton(
                    onPress: _phase == _RecPhase.recording || _phase == _RecPhase.canStop
                        ? _cancel
                        : () => context.pop(),
                    child: Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppColors.overlayVideoStrong,
                        borderRadius: BorderRadius.circular(30),
                      ),
                      child: Icon(Mdi.get('close'), color: AppColors.textPrimary, size: 20),
                    ),
                  ),
                  const Spacer(),
                  if (_phase == _RecPhase.recording || _phase == _RecPhase.canStop)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: AppColors.overlayVideoStrong,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        widget.isQuickVideo
                            ? _formatElapsed(_elapsedSeconds)
                            : _formatElapsed(_remainingSeconds),
                        style: const TextStyle(
                          color: AppColors.textPrimary,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                  const SizedBox(width: 48), // balance the close button
                ],
              ),
            ),
          ),
          // Countdown overlay
          if (_phase == _RecPhase.countdown)
            Positioned.fill(
              child: ColoredBox(
                color: AppColors.overlayStrong,
                child: Center(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 300),
                    child: Text(
                      '$_countdown',
                      key: ValueKey(_countdown),
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 96,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          // Recording indicator
          if (_phase == _RecPhase.recording && !widget.isQuickVideo)
            Positioned(
              top: 70,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  decoration: BoxDecoration(
                    color: AppColors.overlayVideoStrong,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 10,
                        height: 10,
                        decoration: const BoxDecoration(
                          color: AppColors.primaryAction,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'REC',
                        style: TextStyle(
                          color: AppColors.textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.5,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          // Bottom controls
          SafeArea(
            child: Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 36),
                child: _buildControls(),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildControls() {
    final canStop = _phase == _RecPhase.canStop || widget.isQuickVideo;

    if (_phase == _RecPhase.recording && !canStop) {
      // Regular session: hint that recording is in progress.
      return const Text(
        'Recording...',
        style: TextStyle(color: AppColors.textSecondary, fontSize: 14, fontWeight: FontWeight.w600),
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_phase == _RecPhase.canStop)
          const Padding(
            padding: EdgeInsets.only(bottom: 14),
            child: Text(
              'Timer complete! You can continue or stop.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
          ),
        AnimatedScaleButton(
          onPress: canStop ? _save : null,
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: AppColors.primaryAction,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.primaryActionText, width: 4),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primaryAction.withValues(alpha: 0.5),
                  blurRadius: 20,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: Icon(Mdi.get('stop'), color: AppColors.primaryActionText, size: 32),
          ),
        ),
      ],
    );
  }

  static String _formatElapsed(int seconds) {
    final m = (seconds ~/ 60).toString().padLeft(2, '0');
    final s = (seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}
