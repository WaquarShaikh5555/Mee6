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
 * Two rules keep this honest:
 *
 *  1. **Only a positive match blocks.** No match, no block. If an app updates
 *     and renames its views, Regain stops recognising that screen and does
 *     nothing; it does not start guessing.
 *  2. **A section must be on the list the person chose.** Recognising Reels is
 *     not the same as closing it.
 *
 * An earlier version also refused to match when a "feed" marker was present and
 * required the matched view to cover most of the screen. Both were guesses, and
 * both were wrong: they vetoed the very screens they were meant to protect, so
 * nothing fired at all. What remains is the only thing with evidence behind it
 * — the view id — plus a record of what was actually on screen, so the tables
 * can be corrected from a real phone instead of from memory.
 */
object Surfaces {

  /** Sections of the catalog whose views we can recognise today. */
  private val TOKENS: Map<String, Map<String, List<String>>> = mapOf(
    "instagram" to mapOf(
      // Instagram calls Reels "clips" internally.
      "reels" to listOf("clips_viewer", "clips_swipe", "reel_viewer", "clips_media"),
      "explore" to listOf("explore_tab", "explore_grid", "explore_fragment"),
      "feed" to listOf("feed_timeline", "main_feed", "newsfeed", "feed_recycler", "row_feed")
    ),
    "youtube" to mapOf(
      "shorts" to listOf("reel_watch_fragment", "reel_player", "reel_recycler", "shorts_fragment"),
      "home" to listOf("home_tab", "browse_fragment")
    ),
    "snapchat" to mapOf(
      "camera" to listOf("camera_container", "camera_view", "camera_page", "camera_surface"),
      "spotlight" to listOf("spotlight")
    ),
    // TikTok's For You and Following tabs are the same layout with a different
    // selected tab, and its ids change with every release.
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

  private const val MAX_NODES = 900

  /**
   * Everything read from one screen.
   *
   * `heights` maps a view id to the largest fraction of the display that any
   * node with that id occupied. It is not used to decide anything — it is what
   * makes a report from a phone readable, and what will let the tables below be
   * replaced with facts.
   */
  data class Tree(
    val tokens: Set<String>,
    val heights: Map<String, Float>
  )

  data class Match(val sectionId: String, val token: String)

  /** Walks the tree once, collecting ids, descriptions, and how tall they were. */
  fun collect(root: AccessibilityNodeInfo, screenHeight: Int): Tree {
    val tokens = mutableSetOf<String>()
    val heights = mutableMapOf<String, Float>()
    val queue = ArrayDeque<AccessibilityNodeInfo>()
    queue.addLast(root)

    val bounds = android.graphics.Rect()
    var visited = 0

    while (queue.isNotEmpty() && visited < MAX_NODES) {
      val node = queue.removeFirst()
      visited++

      node.viewIdResourceName?.let { id ->
        val name = id.substringAfterLast('/')
        if (name.isNotEmpty()) {
          val key = name.lowercase()
          tokens.add(key)

          if (screenHeight > 0) {
            node.getBoundsInScreen(bounds)
            val ratio = bounds.height().toFloat() / screenHeight.toFloat()
            if (ratio > (heights[key] ?: 0f)) heights[key] = ratio
          }
        }
      }

      node.contentDescription?.toString()?.let { description ->
        if (description.isNotEmpty()) tokens.add(description.lowercase())
      }

      for (index in 0 until node.childCount) {
        node.getChild(index)?.let { queue.addLast(it) }
      }
    }

    return Tree(tokens, heights)
  }

  /** The first section on screen that the person asked to close, or null. */
  fun match(appId: String, tree: Tree, blocked: Set<String>): Match? {
    val sections = TOKENS[appId] ?: return null

    for ((sectionId, needles) in sections) {
      if (!blocked.contains(sectionId)) continue

      val hit = needles.firstOrNull { needle ->
        tree.tokens.any { token -> token.contains(needle) }
      } ?: continue

      return Match(sectionId, hit)
    }

    return null
  }

  /**
   * A short, readable account of the screen: which ids were on it and how much
   * of the display each covered. Sent by the owner when a surface is not being
   * recognised, so the tables can be corrected against the real app.
   */
  fun describe(tree: Tree, limit: Int = 24): String =
    tree.tokens
      .asSequence()
      .filter { it.length in 3..48 && it.none { char -> char.isWhitespace() } }
      .sorted()
      .take(limit)
      .joinToString(", ") { token ->
        val ratio = tree.heights[token]
        if (ratio == null) token else "$token ${(ratio * 100).toInt()}%"
      }
}
