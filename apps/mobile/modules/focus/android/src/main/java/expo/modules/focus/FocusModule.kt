package expo.modules.focus

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** One app's rule set, as sent from `enforcement.ts`. */
class FocusRule : Record {
  @Field var appId: String = ""
  @Field var sections: List<String> = emptyList()
}

/**
 * The bridge between Focus Mode's screens and the accessibility service.
 *
 * Deliberately small: report whether the service is switched on, open the
 * settings page where it is switched on, list which catalog apps are installed,
 * and hand the current rules to the phone. Everything that acts on another app
 * happens in `FocusAccessibilityService`, reading the same stored rules — so
 * closing a section keeps working while Shaikh's itself is not running.
 */
class FocusModule : Module() {

  private val context: Context
    get() = appContext.reactContext
      ?: throw IllegalStateException("Focus Mode needs a running React context")

  override fun definition() = ModuleDefinition {
    Name("Focus")

    AsyncFunction("getStatus") {
      // A build can leave the service out on purpose: Google Play Protect
      // refuses to install a sideloaded app that declares an accessibility
      // service, so there is an edition without one. In that edition the honest
      // answer is "not in this build", not "grant a permission" for a service
      // that does not exist.
      val declared = isServiceDeclared()
      val active = declared && isServiceEnabled()

      mapOf(
        "availability" to when {
          !declared -> "not-in-this-build"
          active -> "ready"
          else -> "blocked-by-permission"
        },
        "platform" to "android",
        "granularity" to "surface",
        "explanation" to when {
          !declared ->
            "This edition leaves Focus Mode out, because Google Play Protect blocks any sideloaded app that declares an accessibility service. The full build has it — see the release notes."
          active ->
            "Focus Mode is watching for the screens you closed. It sees which screen is open, never what is on it."
          else ->
            "Switch Focus Mode on in Settings → Accessibility. Android requires that before any app can step in."
        }
      )
    }

    AsyncFunction("openSettings") {
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }

    AsyncFunction("detectInstalled") {
      FocusCatalog.allPackages.filter { isInstalled(it) }
    }

    AsyncFunction("getSighting") {
      mapOf(
        "summary" to (FocusRules.sighting(context) ?: ""),
        "at" to FocusRules.sightingAt(context),
        "today" to FocusRules.todayCount(context),
        "error" to (FocusRules.lastError(context) ?: "")
      )
    }

    AsyncFunction("sync") { rules: List<FocusRule>, enabled: Boolean ->
      FocusRules.write(
        context,
        rules.associate { it.appId to it.sections },
        enabled
      )
    }
  }

  /** Whether this build actually declares the service. */
  private fun isServiceDeclared(): Boolean {
    return try {
      @Suppress("DEPRECATION")
      context.packageManager.getServiceInfo(
        ComponentName(context, FocusAccessibilityService::class.java),
        0
      )
      true
    } catch (error: PackageManager.NameNotFoundException) {
      false
    }
  }

  private fun isServiceEnabled(): Boolean {
    val manager = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
      ?: return false

    @Suppress("DEPRECATION")
    val running = manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
    val expected = ComponentName(context, FocusAccessibilityService::class.java)

    return running.any { info ->
      val service = info.resolveInfo?.serviceInfo ?: return@any false
      service.packageName == expected.packageName && service.name == expected.className
    }
  }

  private fun isInstalled(packageName: String): Boolean {
    return try {
      context.packageManager.getPackageInfo(packageName, 0)
      true
    } catch (error: PackageManager.NameNotFoundException) {
      false
    }
  }
}
