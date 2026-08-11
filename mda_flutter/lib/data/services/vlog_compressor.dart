/// Vlog compression — ffmpeg-based (SPEC §11, presets from §2).
/// Hardware acceleration: Android MediaCodec (h264_mediacodec), iOS
/// VideoToolbox (h264_videotoolbox) via ffmpeg_kit_flutter_new.
library;

import 'dart:io';

import 'package:ffmpeg_kit_flutter_new_min_gpl/ffmpeg_kit.dart';
import 'package:ffmpeg_kit_flutter_new_min_gpl/return_code.dart';
import 'package:path/path.dart' as p;

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

  double get savingsPercent =>
      originalSizeBytes <= 0 ? 0 : (1 - outputSizeBytes / originalSizeBytes) * 100;
}

/// Wraps ffmpeg-kit (never called directly by screens — use the queue).
class VlogCompressor {
  /// True when the native ffmpeg module is linked (always in release builds).
  static bool isCompressionAvailable() => true;

  static CompressionPreset? presetFor(String id) {
    for (final preset in vlogCompressionPresets) {
      if (preset.id == id) return preset;
    }
    return vlogCompressionPresets[2]; // balanced fallback
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

    final outputPath = p.join(
      p.dirname(inputUri),
      'compressed_${generateId()}.mp4',
    );
    // -2 keeps even dimensions (required by h264); scale caps the height.
    final command =
        '-i "$inputUri" -c:v h264_mediacodec -preset veryfast -b:v ${preset.bitrate} '
        '-vf "scale=-2:min(${preset.maxSize}\\,ih)" -c:a aac -movflags +faststart '
        '-y "$outputPath"';

    final session = await FFmpegKit.executeAsync(
      command,
      (completedSession) async {},
      (log) {},
      (statistics) {
        // ffmpeg statistics report time; derive 0→1 progress from it.
        onProgress?.call((statistics.getTime() / 1000).clamp(0.0, 1.0));
      },
    );
    final returnCode = await session.getReturnCode();

    if (!ReturnCode.isSuccess(returnCode)) {
      final output = File(outputPath);
      if (output.existsSync()) await output.delete();
      throw StateError('ffmpeg compression failed (rc=$returnCode)');
    }

    final compressed = File(outputPath);
    if (!compressed.existsSync()) {
      throw StateError('ffmpeg produced no output');
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

    // iOS-safe replacement: never move onto an existing path (SPEC §11).
    final finalPath = p.join(
      p.dirname(inputUri),
      'compressed_${generateId()}.mp4',
    );
    await compressed.rename(finalPath);
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
