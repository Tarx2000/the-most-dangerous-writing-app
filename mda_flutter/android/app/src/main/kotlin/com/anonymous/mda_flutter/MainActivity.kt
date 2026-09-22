package com.anonymous.mda_flutter

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.os.StatFs
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream

class MainActivity : FlutterFragmentActivity() {
    companion object {
        private const val STORAGE_CHANNEL = "com.anonymous.mda_flutter/storage"
        private const val PICKER_CHANNEL = "com.anonymous.mda_flutter/backup_picker"
        private const val PICK_BACKUP_REQUEST = 9021
    }

    private val copyBufferBytes = 4 * 1024 * 1024

    private var pickerResult: MethodChannel.Result? = null
    private var copyProgressSink: EventChannel.EventSink? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // WHY: the old Dart probe measured free space by WRITING up to
        // ~1.4 GB of temp data and deleting it (battery/storage hog that
        // could itself trigger ENOSPC mid-import). StatFs answers the same
        // question with zero I/O — how many bytes the volume holding the
        // app sandbox can still accept. -1 = unknown → Dart proceeds.
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            STORAGE_CHANNEL,
        ).setMethodCallHandler { call, result ->
            if (call.method == "getFreeBytes") {
                result.success(queryFreeBytes())
            } else {
                result.notImplemented()
            }
        }
        // WHY a native picker at all: file_selector_android's
        // FileSelectorApiImpl.toFileResponse() does `new byte[size]` +
        // readFully() on the picked file — a single 1.3 GB allocation that
        // OOM-kills the app (512 MB heap limit) BEFORE any Dart backup code
        // runs (proven by the S24 Ultra logcat: OOM inside onActivityResult).
        // This channel returns only a filesystem path: the copy streams in
        // 4 MB chunks straight from the SAF Uri to the app cache, so peak
        // RAM stays flat no matter the backup size.
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            PICKER_CHANNEL,
        ).setMethodCallHandler { call, result ->
            if (call.method == "pickBackupZip") {
                if (pickerResult != null) {
                    result.error("ALREADY_ACTIVE", "A picker is already open.", null)
                    return@setMethodCallHandler
                }
                pickerResult = result
                openBackupPicker()
            } else {
                result.notImplemented()
            }
        }
        EventChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "$PICKER_CHANNEL/progress",
        ).setStreamHandler(
            object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
                    copyProgressSink = events
                }

                override fun onCancel(arguments: Any?) {
                    copyProgressSink = null
                }
            },
        )
    }

    private fun openBackupPicker() {
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "application/zip"
                putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/zip"))
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivityForResult(intent, PICK_BACKUP_REQUEST)
        } catch (e: Exception) {
            finishPickerWithError("PICKER_UNAVAILABLE", "Could not open the file picker: ${e.message}")
        }
    }

    @Deprecated("Legacy result API required for ACTION_OPEN_DOCUMENT on all API levels.")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != PICK_BACKUP_REQUEST) return
        val pending = pickerResult
        pickerResult = null
        if (pending == null) return
        if (resultCode != Activity.RESULT_OK || data?.data == null) {
            // User cancelled — Dart treats null as "do nothing".
            pending.success(null)
            return
        }
        val uri: Uri = data.data!!
        try {
            contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        } catch (_: Exception) {
            // Not all providers grant persistable access; the one-shot read
            // below still works while this activity result is alive.
        }
        Thread {
            copyUriToCache(uri, pending)
        }.start()
    }

    /// Streams the SAF document to `<cache>/mda_backup_import_<ts>.zip`
    /// in 4 MB chunks on a background thread. Only small progress maps
    /// cross to Dart (via the EventChannel) — never file bytes.
    private fun copyUriToCache(uri: Uri, pending: MethodChannel.Result) {
        var output: FileOutputStream? = null
        try {
            val displayName = queryDisplayName(uri) ?: "backup.zip"
            if (!displayName.lowercase().endsWith(".zip")) {
                runOnUiThread {
                    pending.error("NOT_A_ZIP", "Please select a valid .zip backup file.", null)
                }
                return
            }
            val target = File(cacheDir, "mda_backup_import_${System.currentTimeMillis()}.zip")
            val input = contentResolver.openInputStream(uri)
                ?: throw IllegalStateException("Could not open the selected file.")
            val totalBytes = querySizeBytes(uri)
            var copied = 0L
            val buffer = ByteArray(copyBufferBytes)
            output = FileOutputStream(target)
            input.use { stream ->
                while (true) {
                    val read = stream.read(buffer)
                    if (read <= 0) break
                    output.write(buffer, 0, read)
                    copied += read
                    if (totalBytes > 0) {
                        val progress = (copied.toDouble() / totalBytes).coerceIn(0.0, 1.0)
                        runOnUiThread { copyProgressSink?.success(progress) }
                    }
                }
                output.fd.sync()
            }
            output.close()
            output = null
            if (totalBytes > 0 && target.length() != totalBytes) {
                target.delete()
                runOnUiThread {
                    pending.error(
                        "COPY_INCOMPLETE",
                        "The backup file could not be copied completely. Please try again.",
                        null,
                    )
                }
                return
            }
            runOnUiThread { pending.success(target.absolutePath) }
        } catch (e: SecurityException) {
            runOnUiThread {
                pending.error(
                    "PERMISSION_DENIED",
                    "The app was not allowed to read the backup file. Please grant file access and try again.",
                    null,
                )
            }
        } catch (e: Exception) {
            runOnUiThread {
                pending.error("COPY_FAILED", "Could not open the backup file: ${e.message}", null)
            }
        } finally {
            try {
                output?.close()
            } catch (_: Exception) {
            }
            runOnUiThread { copyProgressSink?.success(-1.0) }
        }
    }

    private fun queryDisplayName(uri: Uri): String? {
        return try {
            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val index = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun querySizeBytes(uri: Uri): Long {
        return try {
            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val index = cursor.getColumnIndex(android.provider.OpenableColumns.SIZE)
                if (index >= 0 && cursor.moveToFirst() && !cursor.isNull(index)) {
                    cursor.getLong(index)
                } else {
                    -1L
                }
            } ?: -1L
        } catch (_: Exception) {
            -1L
        }
    }

    private fun finishPickerWithError(code: String, message: String) {
        val pending = pickerResult
        pickerResult = null
        pending?.error(code, message, null)
    }

    private fun queryFreeBytes(): Long {
        return try {
            val dir = applicationContext.filesDir
                ?: Environment.getDataDirectory()
            val stat = StatFs(dir.absolutePath)
            stat.availableBytes
        } catch (_: Exception) {
            -1L
        }
    }
}
