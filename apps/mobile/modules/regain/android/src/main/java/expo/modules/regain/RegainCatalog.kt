package expo.modules.regain

/**
 * The native mirror of `src/regain/catalog.ts`.
 *
 * It only carries what the phone needs while it is watching: which package
 * belongs to which app, and the human names to put on the shield. The rules
 * themselves come from the app through `sync()` and never live here.
 */
object RegainCatalog {

  /** Android package name -> app id used by the TypeScript catalog. */
  private val PACKAGES: Map<String, String> = mapOf(
    "com.instagram.android" to "instagram",
    "com.google.android.youtube" to "youtube",
    "com.snapchat.android" to "snapchat",
    "com.zhiliaoapp.musically" to "tiktok",
    "com.ss.android.ugc.trill" to "tiktok",
    "com.discord" to "discord",
    "com.twitter.android" to "x"
  )

  private val APP_NAMES: Map<String, String> = mapOf(
    "instagram" to "Instagram",
    "youtube" to "YouTube",
    "snapchat" to "Snapchat",
    "tiktok" to "TikTok",
    "discord" to "Discord",
    "x" to "X"
  )

  private val SECTION_NAMES: Map<String, Map<String, String>> = mapOf(
    "instagram" to mapOf(
      "reels" to "Reels feed",
      "explore" to "Explore",
      "story-tray" to "Stories",
      "feed" to "Home feed"
    ),
    "youtube" to mapOf(
      "shorts" to "Shorts",
      "home" to "Home screen"
    ),
    "snapchat" to mapOf(
      "camera" to "Camera",
      "spotlight" to "Spotlight",
      "stories" to "Stories"
    ),
    "tiktok" to mapOf(
      "for-you" to "For You",
      "following" to "Following",
      "live" to "Live"
    ),
    "discord" to mapOf(
      "servers" to "Servers",
      "discovery" to "Server discovery"
    ),
    "x" to mapOf(
      "timeline" to "For You timeline",
      "explore" to "Explore"
    )
  )

  /** Every package the app asks about, for `detectInstalled()`. */
  val allPackages: List<String> = PACKAGES.keys.toList()

  fun appIdFor(packageName: String): String? = PACKAGES[packageName]

  fun appName(appId: String): String = APP_NAMES[appId] ?: appId

  fun sectionName(appId: String, sectionId: String): String =
    SECTION_NAMES[appId]?.get(sectionId) ?: sectionId
}
