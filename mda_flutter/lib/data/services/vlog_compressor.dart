/// Vlog compression — native hardware acceleration via video_compress (SPEC §11).
/// Uses Android MediaCodec and iOS AVAssetExportSession directly without bulky ffmpeg binaries.
library;

import 'dart:async';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:video_compress/video_compress.dart';

import '../../core/config/app_config.dart';
import '../../core/utils.dart';

class CompressionResult {
  const CompressionResult({
    required this.outputUri,
    required this.outputSizeBytes,
    required this.originalSizeBytes,
    required this.wasCompressed,
  });

  final String outputUri;
  final int outputSizeBytes;
  final int originalSizeBytes;
  final bool wasCompressed;

  double get savingsPercent => originalSizeBytes <= 0
      ? 0
      : (1 - outputSizeBytes / originalSizeBytes) * 100;
}

/// Wraps native video compression (never called directly by screens — use the queue).
class VlogCompressor {
  /// True when video compression is available.
  static bool isCompressionAvailable() => true;

  static CompressionPreset? presetFor(String id) {
    for (final preset in vlogCompressionPresets) {
      if (preset.id == id) return preset;
    }
    return vlogCompressionPresets[2]; // balanced fallback
  }

  /// Maps app preset IDs to video_compress VideoQuality
  static VideoQuality _qualityForPreset(String presetId) {
    switch (presetId) {
      case 'light':
        return VideoQuality.HighestQuality;
      case 'balanced':
        return VideoQuality.MediumQuality;
      case 'max':
        return VideoQuality.LowQuality;
      default:
        return VideoQuality.MediumQuality;
    }
  }

  /// Compresses [inputUri] per the preset; returns the original untouched
  /// when the preset is off or the output would be larger (no data loss).
  Future<CompressionResult> compressVideo(
    String inputUri,
    String presetId,
    void Function(double progress)? onProgress,
  ) async {
    final preset = presetFor(presetId);
    final input = File(inputUri);
    if (!input.existsSync()) {
      throw StateError('input video missing: $inputUri');
    }
    final originalSize = input.lengthSync();
    if (preset == null || preset.maxSize <= 0 || preset.bitrate <= 0) {
      return CompressionResult(
        outputUri: inputUri,
        outputSizeBytes: originalSize,
        originalSizeBytes: originalSize,
        wasCompressed: false,
      );
    }

    final quality = _qualityForPreset(presetId);
    Subscription? subscription;
    if (onProgress != null) {
      subscription = VideoCompress.compressProgress$.subscribe((progress) {
        onProgress(progress / 100.0);
      });
    }

    MediaInfo? info;
    try {
      info = await VideoCompress.compressVideo(
        inputUri,
        quality: quality,
        deleteOrigin: false,
        includeAudio: true,
      );
    } finally {
      subscription?.unsubscribe();
    }

    if (info == null || info.path == null) {
      throw StateError('video compression failed: no output produced');
    }

    final compressed = File(info.path!);
    if (!compressed.existsSync()) {
      throw StateError('video compression output file missing');
    }
    final compressedSize = compressed.lengthSync();

    // Output larger than the original → keep the original (no data loss).
    if (compressedSize >= originalSize) {
      await compressed.delete();
      onProgress?.call(1);
      return CompressionResult(
        outputUri: inputUri,
        outputSizeBytes: originalSize,
        originalSizeBytes: originalSize,
        wasCompressed: false,
      );
    }

    // Move to destination directory alongside original file.
    final finalPath = p.join(
      p.dirname(inputUri),
      'compressed_${generateId()}.mp4',
    );
    await compressed.copy(finalPath);
    await compressed.delete();
    await input.delete();
    onProgress?.call(1);

    return CompressionResult(
      outputUri: finalPath,
      outputSizeBytes: compressedSize,
      originalSizeBytes: originalSize,
      wasCompressed: true,
    );
  }
}
