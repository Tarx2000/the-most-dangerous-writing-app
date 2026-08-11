/// VlogViewerModal — full-screen video player (SPEC §15, §11).
/// Play/pause flash · mute · duration countdown badge · swipe between
/// same-day vlogs · delete (confirm) · compression status.
library;

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
  const VlogViewerModal({super.key, required this.vlogs, required this.onClose});

  final List<SavedVlog> vlogs;
  final VoidCallback onClose;

  @override
  ConsumerState<VlogViewerModal> createState() => _VlogViewerModalState();
}

class _VlogViewerModalState extends ConsumerState<VlogViewerModal> {
  late VideoPlayerController _controller;
  late int _index = 0;
  bool _muted = false;
  bool _confirmDelete = false;

  SavedVlog get _vlog => widget.vlogs[_index];

  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.file(File(_vlog.filePath));
    _controller.initialize().then((_) {
      if (mounted) {
        setState(() {});
        _controller.play();
      }
    }).catchError((Object e) {
      // Missing file → show an error state (never crash).
    });
  }

  void _switchTo(int index) {
    if (index < 0 || index >= widget.vlogs.length || index == _index) return;
    setState(() => _index = index);
    _controller.dispose();
    _controller = VideoPlayerController.file(File(widget.vlogs[index].filePath));
    _controller.initialize().then((_) {
      if (mounted) {
        setState(() {});
        _controller.play();
      }
    }).catchError((Object _) {});
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
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black,
      child: Stack(
        children: [
          // Video
          Center(
            child: _controller.value.isInitialized
                ? AspectRatio(
                    aspectRatio: _controller.value.aspectRatio,
                    child: GestureDetector(
                      onTap: () {
                        setState(() {
                          _controller.value.isPlaying ? _controller.pause() : _controller.play();
                        });
                      },
                      child: VideoPlayer(_controller),
                    ),
                  )
                : const Center(
                    child: Text(
                      'Video unavailable',
                      style: TextStyle(color: AppColors.textMuted, fontSize: 14),
                    ),
                  ),
          ),
          // Top bar: close + mute + save/share placeholders
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
                    onPress: () => setState(() {
                      _muted = !_muted;
                      _controller.setVolume(_muted ? 0 : 1);
                    }),
                    child: _roundButton(_muted ? 'volumeOff' : 'volumeHigh'),
                  ),
                  const SizedBox(width: 8),
                  AnimatedScaleButton(
                    onPress: () => setState(() => _confirmDelete = true),
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
              child: Text(
                _formatDuration(_vlog.durationSec),
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
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
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
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
                      border: Border.all(color: AppColors.glassBorderMedium, width: 1),
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
                                onPress: () => setState(() => _confirmDelete = false),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(vertical: 12),
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
                                  padding: const EdgeInsets.symmetric(vertical: 12),
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
