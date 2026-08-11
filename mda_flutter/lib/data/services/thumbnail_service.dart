/// Thumbnail extraction (SPEC §11): frame at 1000 ms, JPEG quality 0.7,
/// stored at `vlog_thumbnails/{id}.jpg` with in-flight dedup.
library;

import 'dart:io';

import 'package:get_thumbnail_video/video_thumbnail.dart';
// ignore: implementation_imports — ImageFormat is not re-exported publicly.
import 'package:get_thumbnail_video/src/image_format.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/logger.dart';

const int thumbnailTimeMs = 1000;
const int thumbnailQuality = 70;

class ThumbnailService {
  final Set<String> _inFlight = {};

  /// Extracts (or returns the cached) thumbnail for a vlog.
  /// Never throws — failures return null and are logged.
  Future<String?> getThumbnail({
    required String vlogId,
    required String videoPath,
    String? existingThumbnailPath,
  }) async {
    if (existingThumbnailPath != null) {
      final existing = File(existingThumbnailPath);
      if (existing.existsSync()) return existingThumbnailPath;
    }
    if (_inFlight.contains(vlogId)) return null;
    _inFlight.add(vlogId);

    try {
      final docs = await getApplicationDocumentsDirectory();
      final thumbDir = Directory(p.join(docs.path, 'vlog_thumbnails'));
      await thumbDir.create(recursive: true);
      final outPath = p.join(thumbDir.path, '$vlogId.jpg');

      final file = await VideoThumbnail.thumbnailFile(
        video: videoPath,
        thumbnailPath: outPath,
        imageFormat: ImageFormat.JPEG,
        timeMs: thumbnailTimeMs,
        quality: thumbnailQuality,
      );
      return file.path;
    } catch (e) {
      logVlog.warn('thumbnail extraction failed', e);
      return null;
    } finally {
      _inFlight.remove(vlogId);
    }
  }

  /// Extracts missing thumbnails for a batch of vlogs (fire-and-forget).
  Future<void> extractAllMissing(
    List<({String id, String filePath, String? thumbnailPath})> vlogs,
    Future<void> Function(String id, String thumbnailPath) onPersist,
  ) async {
    for (final vlog in vlogs) {
      final thumb = await getThumbnail(
        vlogId: vlog.id,
        videoPath: vlog.filePath,
        existingThumbnailPath: vlog.thumbnailPath,
      );
      if (thumb != null && thumb != vlog.thumbnailPath) {
        await onPersist(vlog.id, thumb);
      }
    }
  }
}
