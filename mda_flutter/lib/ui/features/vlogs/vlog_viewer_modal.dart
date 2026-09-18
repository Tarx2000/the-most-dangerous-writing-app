/// VlogViewerModal — full-screen video player (SPEC §15, §11).
/// Play/pause flash · mute · duration countdown badge · swipe between
/// same-day vlogs · delete (confirm) · compression status.
library;

import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:video_player/video_player.dart';

import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/models/saved_vlog.dart';
import '../../../data/providers.dart';
import '../../core/widgets/animated_scale_button.dart';

class VlogViewerModal extends ConsumerStatefulWidget {
  const VlogViewerModal({
    super.key,
    required this.vlogs,
    required this.onClose,
  });

  final List<SavedVlog> vlogs;
  final VoidCallback onClose;

  @override
  ConsumerState<VlogViewerModal> createState() => _VlogViewerModalState();
}

class _VlogViewerModalState extends ConsumerState<VlogViewerModal>
    with WidgetsBindingObserver {
  late VideoPlayerController _controller;
  int _index = 0;
  bool _loading = true;
  bool _unavailable = false;
  bool _wantsPlayback = true;
  bool _resumed = true;
  bool _muted = false;
  bool _confirmDelete = false;

  SavedVlog get _vlog => widget.vlogs[_index];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _resumed = lifecycle == null || lifecycle == AppLifecycleState.resumed;
    _controller = VideoPlayerController.file(File(_vlog.filePath));
    unawaited(_initialize(_controller));
  }

  bool _isCurrent(VideoPlayerController controller) =>
      mounted && identical(controller, _controller);

  Future<void> _initialize(VideoPlayerController controller) async {
    try {
      await controller.initialize();
      if (!_isCurrent(controller)) return;
      // Mute belongs to the viewer session and survives moving between clips.
      await controller.setVolume(_muted ? 0 : 1);
      if (!_isCurrent(controller)) return;
      setState(() => _loading = false);
      await _syncPlayback(controller);
    } catch (_) {
      if (_isCurrent(controller)) {
        setState(() {
          _loading = false;
          _unavailable = true;
        });
      }
    }
  }

  Future<void> _syncPlayback(VideoPlayerController controller) async {
    if (!_isCurrent(controller) || !controller.value.isInitialized) return;
    try {
      if (_resumed && _wantsPlayback && !_confirmDelete) {
        await controller.play();
      } else {
        await controller.pause();
      }
    } catch (_) {
      if (_isCurrent(controller)) setState(() => _unavailable = true);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _resumed = state == AppLifecycleState.resumed;
    // Temporary backgrounding must not erase an intentional manual pause.
    unawaited(_syncPlayback(_controller));
  }

  void _switchTo(int index) {
    if (index < 0 || index >= widget.vlogs.length || index == _index) return;
    final previous = _controller;
    final next = VideoPlayerController.file(File(widget.vlogs[index].filePath));
    setState(() {
      _index = index;
      _controller = next;
      _loading = true;
      _unavailable = false;
      _wantsPlayback = true;
    });
    // Each async continuation owns its controller. A late initializer for the
    // previous clip must never start the newly selected clip or update its UI.
    unawaited(_release(previous));
    unawaited(_initialize(next));
  }

  static Future<void> _release(VideoPlayerController controller) async {
    try {
      await controller.dispose();
    } catch (_) {
      // A failed native player may already have released its texture.
    }
  }

  Future<void> _toggleMute() async {
    final controller = _controller;
    setState(() => _muted = !_muted);
    try {
      await controller.setVolume(_muted ? 0 : 1);
    } catch (_) {
      if (_isCurrent(controller)) setState(() => _unavailable = true);
    }
  }

  Future<void> _togglePlayback() async {
    final controller = _controller;
    _wantsPlayback = !controller.value.isPlaying;
    try {
      if (_wantsPlayback && controller.value.isCompleted) {
        await controller.seekTo(Duration.zero);
      }
      await _syncPlayback(controller);
    } catch (_) {
      if (_isCurrent(controller)) setState(() => _unavailable = true);
    }
  }

  void _setDeleteConfirmation(bool visible) {
    setState(() => _confirmDelete = visible);
    unawaited(_syncPlayback(_controller));
  }

  Future<void> _delete() async {
    vibrate(HapticPatterns.lockAll);
    await ref.read(appDataProvider.notifier).deleteVlog(_vlog.id);
    final file = File(_vlog.filePath);
    if (await file.exists()) await file.delete();
    final thumb = _vlog.thumbnailPath;
    if (thumb != null) {
      final thumbFile = File(thumb);
      if (await thumbFile.exists()) await thumbFile.delete();
    }
    if (mounted) widget.onClose();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_release(_controller));
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black,
      child: Stack(
        children: [
          // Only the small native playback controls and badge listen to clock
          // ticks; the full-screen route does not rebuild on every position.
          Center(
            child: _loading
                ? const CircularProgressIndicator(color: AppColors.textMuted)
                : ValueListenableBuilder<VideoPlayerValue>(
                    valueListenable: _controller,
                    builder: (context, value, child) {
                      if (_unavailable || value.hasError) {
                        return const Text(
                          'Video unavailable',
                          style: TextStyle(
                            color: AppColors.textMuted,
                            fontSize: 14,
                          ),
                        );
                      }
                      return AspectRatio(
                        aspectRatio: value.aspectRatio,
                        child: GestureDetector(
                          onTap: _togglePlayback,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              child!,
                              if (!value.isPlaying)
                                const Center(
                                  child: Icon(
                                    Icons.play_arrow_rounded,
                                    color: Colors.white,
                                    size: 56,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      );
                    },
                    child: VideoPlayer(_controller),
                  ),
          ),
          // Top bar: close, mute, and delete.
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  AnimatedScaleButton(
                    onPress: widget.onClose,
                    child: _roundButton('close'),
                  ),
                  const Spacer(),
                  AnimatedScaleButton(
                    onPress: _toggleMute,
                    child: _roundButton(_muted ? 'volumeOff' : 'volumeHigh'),
                  ),
                  const SizedBox(width: 8),
                  AnimatedScaleButton(
                    onPress: () => _setDeleteConfirmation(true),
                    child: _roundButton('trashCanOutline'),
                  ),
                ],
              ),
            ),
          ),
          // Duration countdown badge
          Positioned(
            bottom: 24,
            right: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.overlayVideoStrong,
                borderRadius: BorderRadius.circular(10),
              ),
              child: ValueListenableBuilder<VideoPlayerValue>(
                valueListenable: _controller,
                builder: (context, value, _) {
                  final duration = value.isInitialized
                      ? value.duration.inSeconds
                      : _vlog.durationSec;
                  final remaining = (duration - value.position.inSeconds).clamp(
                    0,
                    duration < 0 ? 0 : duration,
                  );
                  return Text(
                    _formatDuration(remaining),
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  );
                },
              ),
            ),
          ),
          // Swipe between same-day vlogs
          if (widget.vlogs.length > 1)
            Positioned(
              bottom: 24,
              left: 16,
              child: Row(
                children: [
                  AnimatedScaleButton(
                    onPress: _index > 0 ? () => _switchTo(_index - 1) : null,
                    child: _roundButton('chevronLeft', size: 16),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${_index + 1}/${widget.vlogs.length}',
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(width: 8),
                  AnimatedScaleButton(
                    onPress: _index < widget.vlogs.length - 1
                        ? () => _switchTo(_index + 1)
                        : null,
                    child: _roundButton('chevronRight', size: 16),
                  ),
                ],
              ),
            ),
          // Delete confirm
          if (_confirmDelete)
            Positioned.fill(
              child: ColoredBox(
                color: AppColors.overlayStrong,
                child: Center(
                  child: Container(
                    width: 300,
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceRaised,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: AppColors.glassBorderMedium,
                        width: 1,
                      ),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          'Delete this vlog?',
                          style: TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            Expanded(
                              child: AnimatedScaleButton(
                                onPress: () => _setDeleteConfirmation(false),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 12,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppColors.glassHighlight,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: const Text(
                                    'Cancel',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: AppColors.textPrimary,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: AnimatedScaleButton(
                                onPress: _delete,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 12,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppColors.primaryAction,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: const Text(
                                    'Delete',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: AppColors.primaryActionText,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _roundButton(String icon, {double size = 20}) {
    return Container(
      width: 40,
      height: 40,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.overlayVideoStrong,
        borderRadius: BorderRadius.circular(30),
      ),
      child: Icon(Mdi.get(icon), color: AppColors.textPrimary, size: size),
    );
  }

  static String _formatDuration(int seconds) {
    final m = (seconds ~/ 60).toString().padLeft(2, '0');
    final s = (seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}

/// Use a real route so Android Back dismisses the viewer and its native player.
Future<void> showVlogViewer(
  BuildContext context, {
  required List<SavedVlog> vlogs,
}) async {
  if (vlogs.isEmpty) return;
  await showGeneralDialog<void>(
    context: context,
    barrierColor: Colors.black,
    transitionDuration: const Duration(milliseconds: 220),
    pageBuilder: (viewerContext, animation, secondaryAnimation) =>
        VlogViewerModal(
          vlogs: List.unmodifiable(vlogs),
          onClose: () => Navigator.of(viewerContext).pop(),
        ),
    transitionBuilder: (context, animation, secondaryAnimation, child) =>
        FadeTransition(opacity: animation, child: child),
  );
}
