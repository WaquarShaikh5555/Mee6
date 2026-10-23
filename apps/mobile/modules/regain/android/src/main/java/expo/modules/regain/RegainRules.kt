package expo.modules.regain

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * What the app told the phone to close, and how many times it has stepped in.
 *
 * `SharedPreferences` rather than a database: the payload is a handful of ids,
 * it is rewritten only when a switch changes, and the accessibility service
 * needs to read it on a background thread without waiting for React Native to
 * have started.
 *
 * Anything unreadable is treated as "nothing is blocked". A corrupt record must
 * never close something the person did not ask to close.
 */
object RegainRules {

  private const val PREFS = "regain_rules"
  private const val KEY_PAYLOAD = "payload"
  private const val KEY_DAY = "day"
  private const val KEY_COUNT = "count"
  private const val KEY_SIGHTING = "sighting"
  private const val KEY_SIGHTING_AT = "sighting_at"

  data class Snapshot(val enabled: Boolean, val rules: Map<String, Set<String>>)

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun write(context: Context, rules: Map<String, List<String>>, enabled: Boolean) {
    val apps = JSONObject()
    for ((appId, sections) in rules) {
      if (sections.isEmpty()) continue
      apps.put(appId, JSONArray(sections))
    }

    val payload = JSONObject()
      .put("enabled", enabled)
      .put("rules", apps)

    prefs(context).edit().putString(KEY_PAYLOAD, payload.toString()).apply()
  }

  fun read(context: Context): Snapshot {
    val raw = prefs(context).getString(KEY_PAYLOAD, null) ?: return Snapshot(false, emptyMap())

    return try {
      val payload = JSONObject(raw)
      val enabled = payload.optBoolean("enabled", false)
      val apps = payload.optJSONObject("rules") ?: JSONObject()

      val rules = mutableMapOf<String, Set<String>>()
      val appIds = apps.keys()
      while (appIds.hasNext()) {
        val appId = appIds.next()
        val sections = apps.optJSONArray(appId) ?: continue
        val ids = mutableSetOf<String>()
        for (index in 0 until sections.length()) {
          val id = sections.optString(index, "")
          if (id.isNotEmpty()) ids.add(id)
        }
        if (ids.isNotEmpty()) rules[appId] = ids
      }

      Snapshot(enabled, rules)
    } catch (error: Exception) {
      Snapshot(false, emptyMap())
    }
  }

  /** Counts the encounters for today and returns the new total. */
  fun bumpToday(context: Context): Int {
    val store = prefs(context)
    val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    val storedDay = store.getString(KEY_DAY, null)
    val storedCount = if (storedDay == today) store.getInt(KEY_COUNT, 0) else 0
    val count = storedCount + 1

    store.edit().putString(KEY_DAY, today).putInt(KEY_COUNT, count).apply()
    return count
  }

  @Volatile
  private var lastWrite = 0L

  /**
   * Records the last classification, so the app can show what Regain actually
   * saw. Without this, tuning the recogniser for a new app version would be
   * guesswork in both directions.
   *
   * Throttled: the service looks at the screen several times a second, and this
   * is for a person to read, not a log.
   */
  fun recordSighting(context: Context, summary: String) {
    val now = System.currentTimeMillis()
    if (now - lastWrite < 3000L) return
    lastWrite = now

    prefs(context).edit()
      .putString(KEY_SIGHTING, summary.take(400))
      .putLong(KEY_SIGHTING_AT, now)
      .apply()
  }

  fun sighting(context: Context): String? = prefs(context).getString(KEY_SIGHTING, null)

  fun sightingAt(context: Context): Long = prefs(context).getLong(KEY_SIGHTING_AT, 0L)

  fun todayCount(context: Context): Int {
    val store = prefs(context)
    val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    return if (store.getString(KEY_DAY, null) == today) store.getInt(KEY_COUNT, 0) else 0
  }
}
