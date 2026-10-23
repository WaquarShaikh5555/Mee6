package expo.modules.regain

import android.view.accessibility.AccessibilityNodeInfo

/**
 * Recognising *which screen inside another app* is open.
 *
 * Android shows an accessibility service the view tree of whatever is on
 * screen, including each view's id (`com.instagram.android:id/clips_viewer_…`)
 * and its content description. Those names are the only reliable signal we get
 * — the visible text belongs to other people's posts, so it is never read.
 *
 * Two rules keep this from doing harm:
 *
 *  1. **Only a positive, specific match blocks.** No match, no block. If an app
 *     updates and renames its views, Regain stops recognising that screen and
 *     does nothing; it does not start guessing.
 *  2. **A section must be on the list the person chose.** Detection and
 *     permission are separate: recognising Reels is not the same as closing it.
 *
 * The tables below are the calibration point. They were written against the
 * view names these apps are known to use, and are expected to be adjusted after
 * watching a real device — which is why they live in one obvious place.
 */
object Surfaces {

  /** app id -> section id -> fragments of a view id that mean that screen. */
  private val TOKENS: Map<String, Map<String, List<String>>> = mapOf(
    "instagram" to mapOf(
      // Instagram calls Reels "clips" internally.
      "reels" to listOf("clips_viewer", "clips_swipe", "clips_camera", "reel_viewer"),
      "explore" to listOf("explore_tab", "explore_grid", "explore_fragment"),
      "feed" to listOf("feed_timeline", "main_feed")
    ),
    "youtube" to mapOf(
      "shorts" to listOf("reel_watch_fragment", "reel_player", "reel_recycler", "shorts_fragment")
    ),
    "snapchat" to mapOf(
      "camera" to listOf("camera_container", "camera_view", "camera_page", "camera_surface"),
      "spotlight" to listOf("spotlight")
    ),
    // TikTok's For You and Following tabs are the same layout with a different
    // selected tab, and its ids change with every release. Nothing is claimed
    // until that can be detected without guessing.
    "tiktok" to mapOf(),
    "discord" to mapOf(
      "servers" to listOf("guilds_list", "guild_list", "guild_item"),
      "discovery" to listOf("guild_discovery", "discovery_item")
    ),
    "x" to mapOf(
      "timeline" to listOf("home_timeline", "timeline_recycler"),
      "explore" to listOf("explore_tab", "trends_list")
    )
  )

  private const val MAX_NODES = 600

  /**
   * View ids and content descriptions on screen, lowercased and stripped of the
   * package prefix, so a fragment can be matched without caring which build of
   * the app it came from.
   */
  fun collect(root: AccessibilityNodeInfo): Set<String> {
    val tokens = mutableSetOf<String>()
    val queue = ArrayDeque<AccessibilityNodeInfo>()
    queue.addLast(root)

    var visited = 0
    while (queue.isNotEmpty() && visited < MAX_NODES) {
      val node = queue.removeFirst()
      visited++

      node.viewIdResourceName?.let { id ->
        val name = id.substringAfterLast('/')
        if (name.isNotEmpty()) tokens.add(name.lowercase())
      }

      node.contentDescription?.toString()?.let { description ->
        if (description.isNotEmpty()) tokens.add(description.lowercase())
      }

      for (index in 0 until node.childCount) {
        node.getChild(index)?.let { queue.addLast(it) }
      }
    }

    return tokens
  }

  /** The first blocked section present on screen, or null. */
  fun match(appId: String, tokens: Set<String>, blocked: Set<String>): String? {
    val sections = TOKENS[appId] ?: return null

    for ((sectionId, needles) in sections) {
      if (!blocked.contains(sectionId)) continue
      if (needles.any { needle -> tokens.any { token -> token.contains(needle) } }) {
        return sectionId
      }
    }

    return null
  }
}
