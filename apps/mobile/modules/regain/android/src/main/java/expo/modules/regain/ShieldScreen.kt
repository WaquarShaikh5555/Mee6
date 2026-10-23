package expo.modules.regain

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The screen a person sees instead of the feed.
 *
 * Built in code rather than inflated from XML so it has no dependency on the
 * host app's resources, and drawn with the same Ink & Peacock palette as
 * `src/regain/ShieldMessage.tsx`: parchment ground, peacock accent, one large
 * line. The wording is identical across the in-app preview and this overlay —
 * the same promise whichever one a person is looking at.
 */
object ShieldScreen {

  private const val BACKGROUND = 0xFFF7F5EF.toInt() // parchment.50
  private const val INK = 0xFF1E1C18.toInt() // parchment.900
  private const val MUTED = 0xFF625C50.toInt() // parchment.600
  private const val PEACOCK = 0xFF0E6F6B.toInt() // peacock.600
  private const val RULE = 0xFFE4E0D5.toInt() // parchment.200

  fun build(
    context: Context,
    appId: String,
    sectionId: String,
    occasion: Int,
    onLeave: () -> Unit
  ): View {
    val scale = context.resources.displayMetrics.density
    // A value, not a function: it is handed to the helpers below.
    val dp: (Int) -> Int = { value -> (value * scale).toInt() }

    val root = FrameLayout(context).apply {
      setBackgroundColor(BACKGROUND)
      isClickable = true
    }

    val column = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(32), dp(48), dp(32), dp(40))
    }

    column.addView(label(context, "REGAIN", dp))

    column.addView(
      text(context, "Make yourself better.", 40f, INK, dp).apply {
        typeface = Typeface.create("serif", Typeface.NORMAL)
        setPadding(0, dp(24), 0, 0)
        gravity = Gravity.CENTER
      }
    )

    val sentence = "${RegainCatalog.sectionName(appId, sectionId)} on " +
      "${RegainCatalog.appName(appId)} is closed while Regain is on."

    column.addView(
      text(context, sentence, 17f, MUTED, dp).apply {
        setPadding(0, dp(16), 0, 0)
        gravity = Gravity.CENTER
      }
    )

    column.addView(
      text(context, occasionText(occasion), 15f, MUTED, dp).apply {
        setPadding(0, dp(12), 0, 0)
        gravity = Gravity.CENTER
      }
    )

    column.addView(
      View(context).apply {
        setBackgroundColor(RULE)
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1))
          .apply { topMargin = dp(32) }
      }
    )

    column.addView(
      text(
        context,
        "Everything else still works — messages, and anything someone sent you.",
        15f,
        MUTED,
        dp
      ).apply {
        setPadding(0, dp(24), 0, 0)
        gravity = Gravity.CENTER
      }
    )

    column.addView(
      button(context, "Leave", dp, onLeave).apply {
        val params = LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.WRAP_CONTENT,
          LinearLayout.LayoutParams.WRAP_CONTENT
        )
        params.topMargin = dp(32)
        layoutParams = params
      }
    )

    root.addView(column, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.WRAP_CONTENT
    ).apply { gravity = Gravity.CENTER })

    return root
  }

  private fun occasionText(count: Int): String = when (count) {
    0, 1 -> "The first time today."
    2 -> "The second time today."
    3 -> "The third time today."
    else -> "The ${count}th time today."
  }

  private fun label(context: Context, value: String, dp: (Int) -> Int): TextView =
    text(context, value, 11f, PEACOCK, dp).apply {
      letterSpacing = 0.3f
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      gravity = Gravity.CENTER
    }

  private fun text(
    context: Context,
    value: String,
    size: Float,
    colour: Int,
    dp: (Int) -> Int
  ): TextView = TextView(context).apply {
    text = value
    setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
    setTextColor(colour)
    includeFontPadding = false
  }

  private fun button(
    context: Context,
    value: String,
    dp: (Int) -> Int,
    onPress: () -> Unit
  ): TextView = TextView(context).apply {
    text = value
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
    setTextColor(Color.WHITE)
    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    gravity = Gravity.CENTER
    setPadding(dp(28), dp(14), dp(28), dp(14))
    background = GradientDrawable().apply {
      setColor(PEACOCK)
      cornerRadius = dp(999).toFloat()
    }
    isClickable = true
    isFocusable = true
    setOnClickListener { onPress() }
  }
}
