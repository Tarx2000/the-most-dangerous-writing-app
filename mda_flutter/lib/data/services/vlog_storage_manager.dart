/// Vlog disk management (SPEC §11) — orphan cleanup + reattach.
library;

import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/config/app_config.dart';
import '../../core/logger.dart';

class OrphanVlogInfo {
  const OrphanVlogInfo({required this.path, required this.sizeBytes, required this.lastModified});

  final String path;
  final int sizeBytes;
  final int lastModified;
}

class VlogStorageManager {
  /// Deletes files in `vlogs/` without a DB entry. Only auto-cleanup —
  /// never touches user content outside the sandbox (SPEC §11).
  Future<int> cleanupOrphanedVlogs(List<String> knownVlogPaths) async {
    try {
      final docs = await getApplicationDocumentsDirectory();
      final dir = Directory(p.join(docs.path, vlogStorageDir));
      if (!await dir.exists()) return 0;
      final known = knownVlogPaths.toSet();
      var removed = 0;
      await for (final entity in dir.list()) {
        if (entity is! File) continue;
        if (entity.path.endsWith('.jpg') || entity.path.endsWith('.png')) continue;
        if (known.contains(entity.path)) continue;
        await entity.delete();
        removed++;
      }
      return removed;
    } catch (e) {
      logVlog.warn('orphan cleanup failed', e);
      return 0;
    }
  }

  /// Diagnostic scan of files without a DB entry (skip images).
  Future<List<OrphanVlogInfo>> scanOrphanVlogFiles(List<String> knownVlogPaths) async {
    try {
      final docs = await getApplicationDocumentsDirectory();
      final dir = Directory(p.join(docs.path, vlogStorageDir));
      if (!await dir.exists()) return const [];
      final known = knownVlogPaths.toSet();
      final orphans = <OrphanVlogInfo>[];
      await for (final entity in dir.list()) {
        if (entity is! File) continue;
        if (entity.path.endsWith('.jpg') || entity.path.endsWith('.png')) continue;
        if (known.contains(entity.path)) continue;
        final stat = await entity.stat();
        orphans.add(OrphanVlogInfo(
          path: entity.path,
          sizeBytes: stat.size,
          lastModified: stat.modified.millisecondsSinceEpoch,
        ));
      }
      orphans.sort((a, b) => b.lastModified.compareTo(a.lastModified));
      return orphans;
    } catch (e) {
      logVlog.warn('orphan scan failed', e);
      return const [];
    }
  }

  /// Re-creates vlog DB rows for orphaned files (duration/thumbnail are lost,
  /// size + mtime recovered — SPEC §11).
  Future<({int reattached, int failed})> reattachOrphanVlogFiles(
    List<OrphanVlogInfo> orphans,
    Future<void> Function(String path, int sizeBytes, int lastModified) onReattach,
  ) async {
    var reattached = 0;
    var failed = 0;
    for (final orphan in orphans) {
      try {
        await onReattach(orphan.path, orphan.sizeBytes, orphan.lastModified);
        reattached++;
      } catch (e) {
        logVlog.warn('reattach failed', e);
        failed++;
      }
    }
    return (reattached: reattached, failed: failed);
  }
}
