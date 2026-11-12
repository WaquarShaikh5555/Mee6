package expo.modules.diagnostics

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Catches what kills the app, and leaves the reason in Downloads.
 *
 * Why this exists: the app has now been killed several times by code that looked
 * correct in review and in tests, and the only person who can see the reason is
 * the one holding the phone — no PC, no adb, no log console. Guessing from a
 * symptom costs a whole build each time; this costs one file.
 *
 * A ContentProvider is the earliest reliable hook. It is created before any
 * activity, and with `initOrder="2147483647"` it is created before every other
 * provider — including the ones SDKs bring along and use to initialise
 * themselves at startup. So if an SDK throws while the process is still coming
 * up, the handler is already installed.
 *
 * What it writes, and where:
 *
 *   Downloads/shaikhs-crash-20261103-142210.txt   what the person can send
 *   files/last-crash.txt                          what a screen could show
 *
 * The exception is then passed to the previous handler, so Android still treats
 * it as a crash: this records, it does not swallow.
 *
 * Everything is defensive. A crash handler that throws is worse than none,
 * because it hides the original failure behind its own.
 */
class CrashLogProvider : ContentProvider() {

  override fun onCreate(): Boolean {
    try {
      val context = context?.applicationContext
      if (context != null) install(context)
    } catch (_: Throwable) {
      // Never take the app down while failing to install a logger.
    }
    return true
  }

  // Nothing is stored here: the provider exists for its lifecycle hook.
  override fun query(
    uri: Uri,
    projection: Array<out String>?,
    selection: String?,
    selectionArgs: Array<out String>?,
    sortOrder: String?,
  ): Cursor? = null

  override fun getType(uri: Uri): String? = null

  override fun insert(uri: Uri, values: ContentValues?): Uri? = null

  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0

  override fun update(
    uri: Uri,
    values: ContentValues?,
    selection: String?,
    selectionArgs: Array<out String>?,
  ): Int = 0

  private fun install(context: Context) {
    val previous = Thread.getDefaultUncaughtExceptionHandler()

    // Already ours — do not wrap twice.
    if (previous is Recorder) return

    Thread.setDefaultUncaughtExceptionHandler(Recorder(context, previous))
  }

  private class Recorder(
    private val context: Context,
    private val previous: Thread.UncaughtExceptionHandler?,
  ) : Thread.UncaughtExceptionHandler {

    override fun uncaughtException(thread: Thread, error: Throwable) {
      try {
        write(context, describe(context, thread, error))
      } catch (_: Throwable) {
        // Fall through to the real handler regardless.
      }

      previous?.uncaughtException(thread, error)
    }
  }

  private companion object {

    fun describe(context: Context, thread: Thread, error: Throwable): String {
      val trace = StringWriter()
      error.printStackTrace(PrintWriter(trace))

      return buildString {
        appendLine("Shaikh's — crash report")
        appendLine("Written automatically by the app, so it can be fixed without a computer.")
        appendLine()
        appendLine("When:    ${stamp()}")
        appendLine("Device:  Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
        appendLine("Phone:   ${Build.MANUFACTURER} ${Build.MODEL}")
        appendLine("App:     ${appVersion(context)}")
        appendLine("Thread:  ${thread.name}")
        appendLine()
        appendLine("--- what went wrong ---")
        append(trace.toString())
      }
    }

    fun stamp(): String =
      SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())

    fun appVersion(context: Context): String = try {
      val info = context.packageManager.getPackageInfo(context.packageName, 0)
      "${info.versionName} (${info.longVersionCode})"
    } catch (_: Throwable) {
      "unknown"
    }

    /** Writes to Downloads when the platform allows it, always to app storage. */
    fun write(context: Context, text: String) {
      val name = "shaikhs-crash-${SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())}.txt"

      // App-private copy first: cannot fail on permissions, and is what a
      // future "last crash" screen would read.
      try {
        File(context.filesDir, "last-crash.txt").writeText(text)
      } catch (_: Throwable) {
        // Ignore.
      }

      // Then the copy the person can actually send.
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, "text/plain")
            put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
          }

          val uri = context.contentResolver.insert(
            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
            values,
          ) ?: return

          context.contentResolver.openOutputStream(uri)?.use { stream ->
            stream.write(text.toByteArray())
          }
        } else {
          val directory = Environment.getExternalStoragePublicDirectory(
            Environment.DIRECTORY_DOWNLOADS,
          )
          File(directory, name).writeText(text)
        }
      } catch (_: Throwable) {
        // Storage refused: the private copy is still there.
      }
    }
  }
}
