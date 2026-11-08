package expo.modules.rewarded

import android.app.Activity
import android.os.Handler
import android.os.Looper
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
import java.util.concurrent.atomic.AtomicBoolean

/**
 * One rewarded ad, straight from Google's SDK.
 *
 * Why this module exists instead of `react-native-google-mobile-ads`: that
 * package registers a Fabric view component the moment its JavaScript is
 * imported, and on this React Native version that took the whole process down
 * the first time PDF Arena imported it. Nothing here is registered at import
 * time — this is an Expo module, loaded once by the Expo runtime, and it only
 * talks to the SDK when someone actually taps "watch".
 *
 * The contract with JavaScript is deliberately narrow: one function that shows
 * one rewarded ad and answers with one of four words.
 *
 *   earned       watched through, reward granted
 *   closed       dismissed early — no reward, and no penalty
 *   failed       no fill, offline, SDK error
 *   unavailable  no activity to show an ad on
 *
 * The JavaScript side grants the 48 hours on `failed` and `unavailable` too, so
 * a bad connection can never become a wall in front of someone's document.
 */
class RewardedModule : Module() {

  private val main = Handler(Looper.getMainLooper())

  /** MobileAds.initialize is idempotent, but doing it once is the documented use. */
  @Volatile
  private var initialised = false

  override fun definition() = ModuleDefinition {
    Name("RewardedAds")

    AsyncFunction("show") { unitId: String, promise: Promise ->
      val activity = appContext.currentActivity

      if (activity == null) {
        // Happens if the app was backgrounded between tapping and loading.
        // The caller treats this as "grant it anyway".
        promise.resolve(mapOf("outcome" to "unavailable"))
        return@AsyncFunction
      }

      // Everything the SDK does has to happen on the main thread; Expo runs
      // async functions on a worker.
      main.post { present(activity, unitId, promise) }
    }
  }

  private fun present(activity: Activity, unitId: String, promise: Promise) {
    val settled = AtomicBoolean(false)
    var earned = false

    /** Resolves the promise exactly once, whatever decides to call it first. */
    fun finish(outcome: String) {
      if (settled.compareAndSet(false, true)) {
        promise.resolve(mapOf("outcome" to outcome))
      }
    }

    val context = activity.applicationContext

    if (!initialised) {
      MobileAds.initialize(context) {}
      initialised = true
    }

    // A load that never answers must not leave the button spinning forever.
    // This covers *loading* only — a real ad can run for 30 seconds and be
    // perfectly healthy.
    val timeout = Runnable { finish("failed") }
    main.postDelayed(timeout, LOAD_TIMEOUT_MS)

    val request = AdRequest.Builder().build()

    RewardedAd.load(
      context,
      unitId,
      request,
      object : RewardedAdLoadCallback() {
        override fun onAdLoaded(ad: RewardedAd) {
          main.removeCallbacks(timeout)

          ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
              finish(if (earned) "earned" else "closed")
            }

            override fun onAdFailedToShowFullScreenContent(error: AdError) {
              // If the reward already landed, keep it: taking it back after a
              // playback glitch would be the worst of both outcomes.
              finish(if (earned) "earned" else "failed")
            }
          }

          try {
            ad.show(activity) { earned = true }
          } catch (error: Throwable) {
            finish("failed")
          }
        }

        override fun onAdFailedToLoad(error: LoadAdError) {
          main.removeCallbacks(timeout)
          finish("failed")
        }
      },
    )
  }

  private companion object {
    const val LOAD_TIMEOUT_MS = 15_000L
  }
}
