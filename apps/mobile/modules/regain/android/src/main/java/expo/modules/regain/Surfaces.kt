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
 * Three rules keep this from doing harm:
 *
 *  1. **Only a positive match blocks.** No match, no block. If an app updates
 *     and renames its views, Regain stops recognising that screen and does
 *     nothing; it does not start guessing.
 *  2. **A section must be on the list the person chose.** Recognising Reels is
 *     not the same as closing it.
 *  3. **A feed is not a player.** A reel inside the home feed matched the
 *     Reels player for real, which is why opening Instagram's home after
 *     leaving Reels showed the shield again. Sections marked `fullScreen` now
 *     have to cover most of the display, and a small list of feed markers
 *     vetoes the match outright.
 *
 * The tables below are the calibration point. They were written against the
 * view names these apps are known to use, and are expected to be adjusted after
 * watching a real device — which is why they live in one obvious place, and why
 * the service records what it last saw.
 */
object Surfaces {

  /** What a section looks like in the view tree. */
  private data class Rule(
    /** Fragments of a view id that identify the surface. */
    val tokens: List<String>,
    /** If any of these are on screen, this is not that surface. */
    val absent: List<String> = emptyList(),
    /** The real player covers the screen; a card in a feed does not. */
    val fullScreen: Boolean = false
  )

  private val RULES: Map<String, Map<String, Rule>> = mapOf(
    "instagram" to mapOf(
      // Instagram calls Reels "clips" internally.
      "reels" to Rule(
        tokens = listOf("clips_viewer", "clips_swipe", "reel_viewer"),
        absent = listOf("feed_timeline", "main_feed", "direct_inbox", "direct_thread"),
        fullScreen = true
      ),
      "explore" to Rule(
        tokens = listOf("explore_tab", "explore_grid", "explore_fragment"),
        absent = listOf("direct_inbox", "direct_thread")
      ),
      "feed" to Rule(
        tokens = listOf("feed_timeline", "main_feed"),
        absent = listOf("direct_inbox", "direct_thread")
      )
    ),
    "youtube" to mapOf(
      "shorts" to Rule(
        tokens = listOf("reel_watch_fragment", "reel_player", "reel_recycler", "shorts_fragment"),
        fullScreen = true
      )
    ),
    "snapchat" to mapOf(
      "camera" to Rule(
        tokens = listOf("camera_container", "camera_view", "camera_page", "camera_surface"),
        absent = listOf("chat_list", "conversation_list")
      ),
      "spotlight" to Rule(tokens = listOf("spotlight"))
    ),
    // TikTok's For You and Following tabs are the same layout with a different
    // selected tab, and its ids change with every release. Nothing is claimed
    // until that can be detected without guessing.
    "tiktok" to mapOf(),
    "discord" to mapOf(
      "servers" to Rule(
        tokens = listOf("guilds_list", "guild_list", "guild_item"),
        absent = listOf("dm_list", "private_channels")
      ),
      "discovery" to Rule(tokens = listOf("guild_discovery", "discovery_item"))
    ),
    "x" to mapOf(
      "timeline" to Rule(
        tokens = listOf("home_timeline", "timeline_recycler"),
        absent = listOf("messages_list", "dm_list")
      ),
      "explore" to Rule(tokens = listOf("explore_tab", "trends_list"))
    )
  )

  private const val MAX_NODES = 600
  private const val TALL_ENOUGH = 0.6f

  /** Everything read from one screen, already reduced to what matters. */
  data class Tree(
    /** View ids and content descriptions present, lowercased. */
    val tokens: Set<String>,
    /** Ids belonging to a view that covers most of the display. */
    val tallTokens: Set<String>
  )

  data class Match(val sectionId: String, val token: String)

  /**
   * Walks the tree once and keeps two things: every id/description on screen,
   * and which of those ids belong to something nearly full-height.
   */
  fun collect(root: AccessibilityNodeInfo, screenHeight: Int): Tree {
    val tokens = mutableSetOf<String>()
    val tall = mutableSetOf<String>()
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
            if (bounds.height() >= screenHeight * TALL_ENOUGH) tall.add(key)
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

    return Tree(tokens, tall)
  }

  /** The first blocked section present on screen, or null. */
  fun match(appId: String, tree: Tree, blocked: Set<String>): Match? {
    val sections = RULES[appId] ?: return null

    for ((sectionId, rule) in sections) {
      if (!blocked.contains(sectionId)) continue
      if (rule.absent.any { marker -> tree.tokens.any { it.contains(marker) } }) continue

      val hit = rule.tokens.firstOrNull { needle ->
        tree.tokens.any { token -> token.contains(needle) }
      } ?: continue

      if (rule.fullScreen) {
        val coversScreen = tree.tallTokens.any { it.contains(hit) }
        if (!coversScreen) continue
      }

      return Match(sectionId, hit)
    }

    return null
  }
}
