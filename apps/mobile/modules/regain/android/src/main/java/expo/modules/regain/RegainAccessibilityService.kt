package expo.modules.regain

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * The part that actually steps in.
 *
 * Every window change in any app wakes this service. It looks at one thing only
 * — the view ids on screen — and compares them with the rules the person chose.
 * If a blocked surface is present it covers that screen with `ShieldScreen`,
 * which says "Make yourself better." and offers one way out.
 *
 * It never reads the text of a post, a message, or a notification, never sends
 * anything off the device, and never touches an app that is not in the catalog.
 */
class RegainAccessibilityService : AccessibilityService() {

  companion object {
    /** Set while the service is running, so the module can report honestly. */
    @Volatile
    var instance: RegainAccessibilityService? = null
      private set

    private const val SETTLE_MS = 180L
    /** Long enough to land somewhere else before we look again. */
    private const val LEAVE_COOLDOWN_MS = 4000L
  }

  private val handler = Handler(Looper.getMainLooper())
  private val evaluate = Runnable { evaluateScreen() }

  private var overlay: View? = null
  private var overlayKey: String? = null
  private var cooldownUntil = 0L

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    val type = event?.eventType ?: return
    if (type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
      type != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
    ) {
      return
    }

    // Apps emit bursts of events while a screen animates in. Waiting for the
    // burst to finish means we read a settled tree instead of a half-built one.
    handler.removeCallbacks(evaluate)
    handler.postDelayed(evaluate, SETTLE_MS)
  }

  override fun onInterrupt() {
    hide()
  }

  override fun onDestroy() {
    handler.removeCallbacks(evaluate)
    hide()
    instance = null
    super.onDestroy()
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    // A rotation rebuilds the window; drop the overlay so it is added fresh at
    // the new size rather than stretched.
    hide()
    handler.postDelayed(evaluate, SETTLE_MS)
  }

  private fun evaluateScreen() {
    if (!isInteractive()) {
      hide()
      return
    }

    if (System.currentTimeMillis() < cooldownUntil) {
      hide()
      return
    }

    val target = findBlockedSurface()
    if (target == null) {
      hide()
      return
    }

    show(target.appId, target.sectionId)
  }

  private fun isInteractive(): Boolean {
    val power = getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager ?: return true
    return power.isInteractive
  }

  private data class Target(val appId: String, val sectionId: String)

  /** The surface on screen that the person asked to close. */
  private fun findBlockedSurface(): Target? {
    val snapshot = RegainRules.read(this)
    if (!snapshot.enabled || snapshot.rules.isEmpty()) return null

    val root: AccessibilityNodeInfo = try {
      rootInActiveWindow
    } catch (error: Exception) {
      null
    } ?: return null

    val packageName = root.packageName?.toString() ?: return null
    if (packageName == this.packageName) return null

    val appId = RegainCatalog.appIdFor(packageName) ?: return null
    val blocked = snapshot.rules[appId] ?: return null

    val tree = try {
      Surfaces.collect(root, resources.displayMetrics.heightPixels)
    } catch (error: Exception) {
      return null
    }

    val match = Surfaces.match(appId, tree, blocked)

    // Remember what was seen, whether or not it was blocked. This is the only
    // way to correct the recogniser for a version of an app we cannot run.
    RegainRules.recordSighting(
      this,
      if (match == null) {
        "$appId · nothing matched · ${tree.tokens.take(10).joinToString(", ")}"
      } else {
        "$appId · ${match.sectionId} · ${match.token}"
      }
    )

    return match?.let { Target(appId, it.sectionId) }
  }

  private fun show(appId: String, sectionId: String) {
    val key = "$appId/$sectionId"
    if (overlay != null && overlayKey == key) return

    hide()

    val manager = getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
    val occasion = RegainRules.bumpToday(this)
    val view = ShieldScreen.build(this, appId, sectionId, occasion) { leave(appId) }

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    ).apply { gravity = Gravity.TOP or Gravity.START }

    try {
      manager.addView(view, params)
      overlay = view
      overlayKey = key
    } catch (error: Exception) {
      overlay = null
      overlayKey = null
    }
  }

  /**
   * The person tapped the button, so this is their action, not ours: go where
   * the app has a better room (Instagram's DMs), and if it has none, press Back
   * for them. Either way they land somewhere they chose to be.
   */
  private fun leave(appId: String) {
    hide()
    cooldownUntil = System.currentTimeMillis() + LEAVE_COOLDOWN_MS

    if (openEscape(appId)) return
    performGlobalAction(GLOBAL_ACTION_BACK)
  }

  private fun openEscape(appId: String): Boolean {
    val uri = RegainCatalog.escapeUri(appId) ?: return false

    return try {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      startActivity(intent)
      true
    } catch (error: Exception) {
      false
    }
  }

  private fun hide() {
    val view = overlay ?: return
    val manager = getSystemService(Context.WINDOW_SERVICE) as? WindowManager
    try {
      manager?.removeView(view)
    } catch (error: Exception) {
      // The window may already be gone (rotation, app closed); nothing to do.
    }
    overlay = null
    overlayKey = null
  }
}
