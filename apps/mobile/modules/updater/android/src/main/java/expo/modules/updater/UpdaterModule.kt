package expo.modules.updater

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Getting a new version onto the phone without a browser.
 *
 * Three steps, and only the middle one is interesting:
 *
 *  1. [download] fetches the APK into the cache and reports its progress, so the
 *     screen can show a real percentage rather than a spinner of unknown length.
 *  2. [install] hands that file to the system installer through a `content://`
 *     URI. Android shows its own one-tap confirmation — that prompt cannot be
 *     skipped by an ordinary app, and any app that claims otherwise on a
 *     sideloaded build is either privileged or lying.
 *  3. [discard] deletes the download, because a 63 MB APK left in the cache is
 *     not something to keep after it has been installed.
 *
 * The one-time permission ("allow installs from Shaikh's") is why [canInstall]
 * and [openInstallSettings] exist: the screen asks the person to grant it before
 * an update is due, so the day an update arrives it is a single tap.
 */
class UpdaterModule : Module() {

  private val context: Context
    get() = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("The updater needs a running app context")

  private fun downloadDir(): File =
    File(context.cacheDir, "updater").apply { if (!exists()) mkdirs() }

  override fun definition() = ModuleDefinition {
    Name("Updater")

    /** Progress while an APK is coming down: `{ received, total }`. */
    Events("onProgress")

    /**
     * Downloads `url` into the cache under a safe name and returns where it is.
     *
     * A partial file is deleted on failure, so a retry never installs half an
     * APK — which the installer rejects anyway, but with a much worse message.
     */
    AsyncFunction("download") { url: String, name: String ->
      val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "-").ifBlank { "update.apk" }
      val target = File(downloadDir(), safe)

      // Anything left from an earlier attempt is stale by definition.
      downloadDir().listFiles()?.forEach { it.delete() }

      var connection: HttpURLConnection? = null

      try {
        connection = (URL(url).openConnection() as HttpURLConnection).apply {
          connectTimeout = 20_000
          readTimeout = 30_000
          instanceFollowRedirects = true
          setRequestProperty("User-Agent", "Shaikhs-Updater")
          setRequestProperty("Accept", "application/octet-stream")
        }

        val code = connection.responseCode
        if (code !in 200..299) {
          throw IllegalStateException("The download answered $code. Try again in a moment.")
        }

        val total = connection.contentLengthLong
        var received = 0L
        var reported = 0L

        connection.inputStream.use { input ->
          FileOutputStream(target).use { output ->
            val buffer = ByteArray(64 * 1024)

            while (true) {
              val read = input.read(buffer)
              if (read < 0) break

              output.write(buffer, 0, read)
              received += read

              // Four reports a second is enough to look live and cheap enough
              // not to flood the bridge on a fast connection.
              val now = System.currentTimeMillis()
              if (now - reported > 250) {
                reported = now
                sendEvent("onProgress", mapOf("received" to received, "total" to total))
              }
            }

            output.flush()
          }
        }

        if (total > 0 && received < total) {
          throw IllegalStateException("The download stopped early. Try again on a better connection.")
        }

        sendEvent("onProgress", mapOf("received" to received, "total" to received))

        mapOf("uri" to Uri.fromFile(target).toString(), "bytes" to received)
      } catch (error: Throwable) {
        target.delete()
        throw IllegalStateException(error.message ?: "The update could not be downloaded.")
      } finally {
        connection?.disconnect()
      }
    }

    /**
     * Hands the APK to the system installer.
     *
     * Returns false when Android has not been told this app may install
     * packages; the screen turns that into the one-time permission step rather
     * than an error nobody can act on.
     */
    AsyncFunction("install") { uri: String ->
      val path = Uri.parse(uri).path
        ?: throw IllegalStateException("The update file is missing")

      val file = File(path)
      if (!file.exists()) throw IllegalStateException("The update file is missing")

      if (!canInstallNow()) return@AsyncFunction false

      val shared = FileProvider.getUriForFile(context, "${context.packageName}.updater", file)

      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(shared, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      val activity = appContext.currentActivity
        ?: throw IllegalStateException("The app has to be open to install an update")

      activity.startActivity(intent)
      true
    }

    /** Whether "install unknown apps" is already allowed for this app. */
    AsyncFunction("canInstall") {
      canInstallNow()
    }

    /** Opens the one settings screen that turns [canInstall] true. */
    Function("openInstallSettings") {
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
          data = Uri.parse("package:${context.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
      } else {
        Intent(Settings.ACTION_SECURITY_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
      }

      appContext.currentActivity?.startActivity(intent)
        ?: context.startActivity(intent)

      true
    }

    /** Removes a download, whether or not it was installed. */
    AsyncFunction("discard") { uri: String ->
      val path = Uri.parse(uri).path
      if (path != null) {
        val file = File(path)
        if (file.absolutePath.startsWith(downloadDir().absolutePath)) file.delete()
      }
      true
    }
  }

  private fun canInstallNow(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.packageManager.canRequestPackageInstalls()
    } else {
      true
    }
}
