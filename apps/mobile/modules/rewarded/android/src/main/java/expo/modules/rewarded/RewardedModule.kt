package expo.modules.rewarded

import android.app.Activity
import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/**
 * One rewarded ad, straight from Google's SDK.
 *
 * The contract with JavaScript is deliberately narrow: one function that shows
 * one rewarded ad and answers with one of four words, plus the reason when it
 * could not.
 *
 *   earned       watched through, reward granted
 *   closed       dismissed early — no reward, and no penalty
 *   failed       no fill, offline, SDK error  (+ code, e.g. NO_FILL)
 *   unavailable  no activity to show an ad on
 *
 * Two things matter more than they look:
 *
 *  1. **Initialisation is asynchronous and is awaited.** The SDK's startup
 *     provider is removed from the manifest (it used to run before any screen
 *     existed), so the first tap has to initialise the SDK itself. Calling
 *     `RewardedAd.load` in the same tick as `MobileAds.initialize` is a race
 *     that usually loses — the load fails with "SDK not initialised" and the
 *     person sees a button that does nothing.
 *  2. **A failure is written down.** AdMob answers a failed load with a code
 *     (`NO_FILL`, `INVALID_REQUEST`, …) that says exactly whose problem it is:
 *     no inventory for this app yet, or a unit id that is not a rewarded unit.
 *     Without it, "the ad didn't open" is unfalsifiable. It goes to Downloads,
 *     where a phone can reach it.
 */
class RewardedModule : Module() {

  private val main = Handler(Looper.getMainLooper())

  /** Guards against a second initialise call while the first is in flight. */
  private var initialising = false
  private var initialised = false
  private val waiting = mutableListOf<(Boolean) -> Unit>()

  override fun definition() = ModuleDefinition {
    Name("RewardedAds")

    AsyncFunction("show") { unitId: String, promise: Promise ->
      val activity = appContext.currentActivity

      if (activity == null) {
        // Backgrounded between the tap and the load. The caller treats this as
        // "grant it anyway".
        promise.resolve(mapOf("outcome" to "unavailable"))
        return@AsyncFunction
      }

      // The SDK touches the main thread all the way down; Expo runs async
      // functions on a worker.
      main.post { present(activity, unitId, promise) }
    }
  }

  private fun present(activity: Activity, unitId: String, promise: Promise) {
    val settled = AtomicBoolean(false)
    var earned = false

    fun finish(outcome: String, code: String? = null, message: String? = null) {
      if (!settled.compareAndSet(false, true)) return

      promise.resolve(
        buildMap {
          put("outcome", outcome)
          if (code != null) put("code", code)
          if (message != null) put("message", message)
        },
      )
    }

    val context = activity.applicationContext

    // Everything after this runs once the SDK is ready. If it never becomes
    // ready, that is a failure rather than a hang.
    initialise(context) { ready ->
      if (!ready) {
        record(context, unitId, "INIT_FAILED", "ads", "MobileAds.initialize() did not complete")
        finish("failed", "INIT_FAILED", "The ad library did not start up.")
        return@initialise
      }

      // Loading is not the ad: a real ad can run for 30 seconds and be healthy,
      // so this timeout only covers the wait before it appears.
      val timeout = Runnable {
        record(context, unitId, "LOAD_TIMEOUT", "ads", "no answer from AdMob within ${LOAD_TIMEOUT_MS}ms")
        finish("failed", "LOAD_TIMEOUT", "AdMob did not answer in time.")
      }
      main.postDelayed(timeout, LOAD_TIMEOUT_MS)

      RewardedAd.load(
        context,
        unitId,
        AdRequest.Builder().build(),
        object : RewardedAdLoadCallback() {
          override fun onAdLoaded(ad: RewardedAd) {
            main.removeCallbacks(timeout)

            ad.fullScreenContentCallback = object : FullScreenContentCallback() {
              override fun onAdDismissedFullScreenContent() {
                finish(if (earned) "earned" else "closed")
              }

              override fun onAdFailedToShowFullScreenContent(error: AdError) {
                record(context, unitId, error.code.toString(), error.domain, error.message)
                // If the reward already landed, keep it: taking it back after a
                // playback glitch would be the worst of both outcomes.
                finish(if (earned) "earned" else "failed", error.code.toString(), error.message)
              }
            }

            try {
              ad.show(activity) { earned = true }
            } catch (error: Throwable) {
              record(context, unitId, "SHOW_THREW", "ads", error.toString())
              finish("failed", "SHOW_THREW", error.message)
            }
          }

          override fun onAdFailedToLoad(error: LoadAdError) {
            main.removeCallbacks(timeout)

            // The useful part. NO_FILL means AdMob has nothing to serve for
            // this app yet; INVALID_REQUEST usually means the unit id is not a
            // rewarded unit. One of those two is nearly always the answer.
            record(context, unitId, error.code.toString(), error.domain, error.message)
            finish("failed", error.code.toString(), error.message)
          }
        },
      )
    }
  }

  /**
   * Initialises once, and calls back on the main thread when it is really done.
   *
   * Callers queue behind the first one, so two quick taps do not initialise the
   * SDK twice. A watchdog answers `false` if the SDK never reports back, which
   * is the difference between "no ad" and "the button is dead".
   */
  private fun initialise(context: android.content.Context, callback: (Boolean) -> Unit) {
    if (initialised) {
      callback(true)
      return
    }

    waiting.add(callback)

    if (initialising) return
    initialising = true

    val watchdog = Runnable {
      if (!initialised) {
        initialising = false
        val pending = waiting.toList()
        waiting.clear()
        pending.forEach { it(false) }
      }
    }
    main.postDelayed(watchdog, INIT_TIMEOUT_MS)

    try {
      MobileAds.initialize(context) {
        main.post {
          main.removeCallbacks(watchdog)
          initialised = true
          initialising = false

          val pending = waiting.toList()
          waiting.clear()
          pending.forEach { it(true) }
        }
      }
    } catch (error: Throwable) {
      main.removeCallbacks(watchdog)
      initialising = false
      val pending = waiting.toList()
      waiting.clear()
      pending.forEach { it(false) }
    }
  }

  /**
   * Leaves the reason in Downloads.
   *
   * Same folder as the crash reports, same purpose: a phone is the only place
   * this can be read, and "the ad didn't open" cannot be acted on.
   */
  private fun record(
    context: android.content.Context,
    unitId: String,
    code: String,
    domain: String,
    message: String?,
  ) {
    try {
      val when_ = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
      val text = buildString {
        appendLine("Shaikh's — ad request failed")
        appendLine("Written by the app so a failure can be diagnosed without a computer.")
        appendLine()
        appendLine("When:    $when_")
        appendLine("Code:    $code")
        appendLine("Domain:  $domain")
        appendLine("Message: ${message ?: "-"}")
        appendLine("Unit:    $unitId")
        appendLine("App:     ${appVersion(context)}")
        appendLine()
        appendLine("NO_FILL means AdMob has no ad to serve right now — normal for a new app")
        appendLine("or unit, and normal for a sideloaded install. INVALID_REQUEST usually")
        appendLine("means the unit id is not a Rewarded unit.")
      }

      try {
        File(context.filesDir, "last-ad-error.txt").writeText(text)
      } catch (_: Throwable) {
        // Ignore.
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val values = ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, "shaikhs-ad-error.txt")
          put(MediaStore.Downloads.MIME_TYPE, "text/plain")
          put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        }
        val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        uri?.let {
          context.contentResolver.openOutputStream(it)?.use { stream ->
            stream.write(text.toByteArray())
          }
        }
      }
    } catch (_: Throwable) {
      // Never let bookkeeping break the ad flow.
    }
  }

  private fun appVersion(context: android.content.Context): String = try {
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    "${info.versionName} (${info.longVersionCode})"
  } catch (_: Throwable) {
    "unknown"
  }

  private companion object {
    const val LOAD_TIMEOUT_MS = 15_000L
    const val INIT_TIMEOUT_MS = 10_000L
  }
}
