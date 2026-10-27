package expo.modules.pdfarena

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.net.Uri
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import com.tom_roush.pdfbox.util.Matrix
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import kotlin.math.abs

/**
 * Signatures: turning one into ink on a page.
 *
 * Three things live here because they are one story: the picture a person made
 * (drawn with a finger, or a photo of a signature on paper), where they put it
 * on the page, and how it lands at a size that matches what they saw.
 *
 * Coordinates arrive as fractions of what the *screen* showed, top-left
 * origin. A PDF page is bottom-left origin and may carry its own `\Rotate`, so
 * every point goes through [toUserSpace], which is the only place that
 * difference is allowed to matter.
 */
object PdfSignatures {

  /** Where one signature sits on one page. Fractions are of the visible page. */
  data class Placement(
    /** One-based, as everywhere else in this feature. */
    val page: Int,
    /** Centre of the signature, 0–1 across the page from the left. */
    val x: Float,
    /** Centre of the signature, 0–1 down the page from the top. */
    val y: Float,
    /** Width as a fraction of the page's visible width. */
    val width: Float,
    /** Degrees clockwise, as the editor showed it. */
    val rotation: Float,
  )

  private const val DEFAULT_COLOUR = "#111111"

  /* ------------------------------------------------------------- reading --- */

  fun placements(payload: JSONObject): List<Placement> {
    val array = payload.optJSONArray("placements") ?: return emptyList()

    return (0 until array.length()).mapNotNull { index ->
      val entry = array.optJSONObject(index) ?: return@mapNotNull null
      val page = entry.optInt("page", 0)
      if (page < 1) return@mapNotNull null

      Placement(
        page = page,
        x = entry.optDouble("x", 0.5).toFloat().coerceIn(0f, 1f),
        y = entry.optDouble("y", 0.12).toFloat().coerceIn(0f, 1f),
        width = entry.optDouble("w", 0.32).toFloat().coerceIn(0.03f, 1f),
        rotation = entry.optDouble("rotation", 0.0).toFloat(),
      )
    }
  }

  /** The signature itself: a file when it came from a photo, strokes otherwise. */
  fun render(context: Context, payload: JSONObject): Bitmap? {
    val file = payload.optString("file").ifEmpty { null }

    if (file != null) {
      val bitmap = decodeFile(file)
      if (bitmap != null) return bitmap
    }

    val strokes = parseStrokes(payload.optJSONArray("strokes"))
    if (strokes.isEmpty()) return null

    return drawStrokes(strokes, colourOf(payload.optString("colour")))
  }

  private fun decodeFile(uri: String): Bitmap? {
    val path = try {
      Uri.parse(uri).path
    } catch (error: Exception) {
      null
    }

    if (path == null) return null
    val file = File(path)
    if (!file.exists()) return null

    val options = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 }
    return BitmapFactory.decodeFile(file.absolutePath, options)
  }

  private fun colourOf(value: String): Int {
    return try {
      Color.parseColor(if (value.length == 7 && value.startsWith("#")) value else DEFAULT_COLOUR)
    } catch (error: Exception) {
      Color.parseColor(DEFAULT_COLOUR)
    }
  }

  private fun parseStrokes(array: JSONArray?): List<FloatArray> {
    if (array == null) return emptyList()

    return (0 until array.length()).mapNotNull { index ->
      val stroke = array.optJSONArray(index) ?: return@mapNotNull null
      val points = FloatArray(stroke.length()) { position ->
        stroke.optDouble(position, 0.0).toFloat()
      }
      if (points.size < 2) null else points
    }
  }

  /* ------------------------------------------------------------ drawing --- */

  /**
   * Places the signature on the page.
   *
   * The matrix maps the image's own unit square into user space, so a rotated
   * signature rotates about its centre and keeps its proportions — drawing it
   * with a plain x/y box cannot do that.
   */
  fun draw(
    document: PDDocument,
    page: PDPage,
    image: PDImageXObject,
    signature: Bitmap,
    placement: Placement,
  ) {
    val rotation = ((page.rotation % 360) + 360) % 360
    val box = page.cropBox ?: page.mediaBox

    // What the reader shows: a quarter turn swaps the page's width and height.
    val visibleWidth = if (rotation == 90 || rotation == 270) box.height else box.width
    val visibleHeight = if (rotation == 90 || rotation == 270) box.width else box.height

    val width = visibleWidth * placement.width
    val height = width * (signature.height.toFloat() / signature.width.toFloat())

    // Centre of the signature, in the picture the person was looking at.
    val displayX = visibleWidth * placement.x
    val displayY = visibleHeight * placement.y

    val centre = toUserSpace(box, rotation, displayX, displayY)

    // A clockwise turn on screen is anticlockwise in PDF coordinates: the two
    // spaces differ by a vertical flip.
    val radians = Math.toRadians((-placement.rotation).toDouble())
    val cos = kotlin.math.cos(radians).toFloat()
    val sin = kotlin.math.sin(radians).toFloat()

    // The matrix maps the image's unit square into user space: scale to the
    // placed size, turn it, then shift so its *centre* lands on the page point.
    // Mapping (0,0) of the square puts the centre at (-w/2, -h/2) before the
    // shift, which is what the halves below undo.
    val a = width * cos
    val b = width * sin
    val c = -height * sin
    val d = height * cos

    val matrix = Matrix(
      a,
      b,
      c,
      d,
      centre.first - (a + c) / 2f,
      centre.second - (b + d) / 2f,
    )

    PDPageContentStream(document, page, PDPageContentStream.AppendMode.APPEND, true, true)
      .use { stream ->
        stream.saveGraphicsState()
        stream.drawImage(image, matrix)
        stream.restoreGraphicsState()
      }
  }

  /**
   * A point from the on-screen page into PDF user space.
   *
   * `displayX` runs left to right, `displayY` runs **down** from the top, which
   * is how the editor thinks. `\Rotate` is applied by the reader, so it is
   * undone here before the point is used.
   */
  private fun toUserSpace(
    box: com.tom_roush.pdfbox.pdmodel.common.PDRectangle,
    rotation: Int,
    displayX: Float,
    displayY: Float,
  ): Pair<Float, Float> {
    val left = box.lowerLeftX
    val bottom = box.lowerLeftY

    return when (rotation) {
      // Turned clockwise: the page's bottom edge is on the left of the screen.
      90 -> (left + displayY) to (bottom + displayX)

      // Turned anticlockwise: the page's top-right corner is at the screen's
      // top-left.
      270 -> (left + box.width - displayY) to (bottom + box.height - displayX)

      // Upside down: the page's bottom-right corner is at the screen's top-left.
      180 -> (left + box.width - displayX) to (bottom + displayY)

      // Upright: only the vertical flip separates the two spaces.
      else -> (left + displayX) to (bottom + box.height - displayY)
    }
  }

  /* ------------------------------------------------------------- strokes --- */

  /**
   * Draws the pad's strokes into a transparent bitmap, cropped to the ink.
   *
   * Points arrive as fractions of the pad's width, so the handwriting keeps its
   * shape on any page. The colour is the one chosen in the pad.
   */
  fun drawStrokes(strokes: List<FloatArray>, colour: Int): Bitmap {
    var minX = Float.MAX_VALUE
    var minY = Float.MAX_VALUE
    var maxX = -Float.MAX_VALUE
    var maxY = -Float.MAX_VALUE

    strokes.forEach { points ->
      var index = 0
      while (index + 1 < points.size) {
        minX = minOf(minX, points[index])
        maxX = maxOf(maxX, points[index])
        minY = minOf(minY, points[index + 1])
        maxY = maxOf(maxY, points[index + 1])
        index += 2
      }
    }

    if (minX > maxX || minY > maxY) {
      return Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888)
    }

    val inkWidth = (maxX - minX).coerceAtLeast(0.0001f)
    val inkHeight = (maxY - minY).coerceAtLeast(0.0001f)
    val padding = inkWidth * 0.04f
    val pixelsPerUnit = 1200f / (inkWidth + padding * 2f)

    val width = 1200
    val height = ((inkHeight + padding * 2f) * pixelsPerUnit).toInt().coerceIn(8, 2400)

    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)

    val paint = Paint().apply {
      isAntiAlias = true
      this.color = colour
      style = Paint.Style.STROKE
      strokeCap = Paint.Cap.ROUND
      strokeJoin = Paint.Join.ROUND
      strokeWidth = (width * 0.008f).coerceAtLeast(2.5f)
    }

    strokes.forEach { points ->
      val path = Path()
      var index = 0
      var started = false

      while (index + 1 < points.size) {
        val x = (points[index] - minX + padding) * pixelsPerUnit
        val y = (points[index + 1] - minY + padding) * pixelsPerUnit

        if (started) path.lineTo(x, y) else { path.moveTo(x, y); started = true }
        index += 2
      }

      if (started) canvas.drawPath(path, paint)
    }

    return bitmap
  }

  /* -------------------------------------------------------- a photo of one --- */

  /**
   * A picked photo, made usable as a signature.
   *
   * A photograph of a signature on paper is mostly paper. Left alone it would
   * be pasted onto the page as a white rectangle with the text underneath
   * hidden. So: crop to the ink, then fade everything close to the paper colour
   * to transparent, which leaves the handwriting and nothing else.
   */
  fun fromPhoto(context: Context, uri: String): Map<String, Any> {
    val (file, temporary) = PdfFiles.materialize(context, Uri.parse(uri))

    try {
      val options = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 }
      val decoded = BitmapFactory.decodeFile(file.absolutePath, options)
        ?: throw PdfOpen.PdfFailure(
          "That picture could not be read. Try a JPG or PNG.",
          PdfOpen.PdfFailure.Kind.UNSUPPORTED,
        )

      val flattened = flatten(decoded)
      val cleaned = stripPaper(flattened)
      val cropped = cropToInk(cleaned)
      val scaled = scaleDown(cropped, 1600)

      val target = File(sourceDir(context), "signature-${System.nanoTime()}.png")
      FileOutputStream(target).use { stream ->
        scaled.compress(Bitmap.CompressFormat.PNG, 100, stream)
      }

      val result = mapOf(
        "uri" to PdfFiles.toUri(target),
        "width" to scaled.width,
        "height" to scaled.height,
      )

      if (scaled !== decoded) scaled.recycle()
      if (cropped !== cleaned && cropped !== scaled) cropped.recycle()
      if (cleaned !== flattened && cleaned !== cropped) cleaned.recycle()
      if (flattened !== decoded) flattened.recycle()
      decoded.recycle()

      return result
    } finally {
      if (temporary) PdfFiles.deleteQuietly(file)
    }
  }

  /** Alpha onto white, so a transparent PNG does not arrive as a black box. */
  private fun flatten(source: Bitmap): Bitmap {
    if (!source.hasAlpha()) return source

    val out = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    canvas.drawColor(Color.WHITE)
    canvas.drawBitmap(source, 0f, 0f, null)
    return out
  }

  /** Near-white becomes transparent; anything darker is kept, softened. */
  private fun stripPaper(source: Bitmap): Bitmap {
    val width = source.width
    val height = source.height
    val pixels = IntArray(width * height)
    source.getPixels(pixels, 0, width, 0, 0, width, height)

    val out = IntArray(width * height)

    for (index in pixels.indices) {
      val colour = pixels[index]
      val r = (colour shr 16) and 0xFF
      val g = (colour shr 8) and 0xFF
      val b = colour and 0xFF
      val luminance = (r * 299 + g * 587 + b * 114) / 1000

      // 210 and above is paper; below 150 is ink; between, a soft edge so the
      // stroke does not turn into a jagged silhouette.
      val alpha = when {
        luminance >= 210 -> 0
        luminance <= 150 -> 255
        else -> ((210 - luminance) * 255) / 60
      }

      if (alpha == 0) {
        out[index] = 0
      } else {
        // Keep the ink's own colour but pull it towards black: a photograph of
        // ballpoint on white paper is mid-grey, which prints as a faint smudge.
        val darkness = 40 + luminance * 60 / 210
        out[index] = Color.argb(alpha, darkness, darkness, darkness)
      }
    }

    val result = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    result.setPixels(out, 0, width, 0, 0, width, height)
    return result
  }

  /** The box the ink actually occupies, plus a small margin. */
  private fun cropToInk(source: Bitmap): Bitmap {
    val width = source.width
    val height = source.height
    val pixels = IntArray(width * height)
    source.getPixels(pixels, 0, width, 0, 0, width, height)

    var minX = width
    var minY = height
    var maxX = -1
    var maxY = -1

    for (y in 0 until height) {
      val row = y * width
      for (x in 0 until width) {
        if ((pixels[row + x] ushr 24) > 20) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }

    if (maxX < minX || maxY < minY) return source

    val margin = ((maxX - minX) * 0.04f).toInt().coerceAtLeast(2)
    val left = (minX - margin).coerceAtLeast(0)
    val top = (minY - margin).coerceAtLeast(0)
    val right = (maxX + margin).coerceAtMost(width - 1)
    val bottom = (maxY + margin).coerceAtMost(height - 1)

    return Bitmap.createBitmap(source, left, top, right - left + 1, bottom - top + 1)
  }

  private fun scaleDown(source: Bitmap, longest: Int): Bitmap {
    val largest = maxOf(source.width, source.height)
    if (largest <= longest) return source

    val scale = longest.toFloat() / largest
    val width = (source.width * scale).toInt().coerceAtLeast(1)
    val height = (source.height * scale).toInt().coerceAtLeast(1)
    return Bitmap.createScaledBitmap(source, width, height, true)
  }

  /* ------------------------------------------------------------- library --- */

  fun libraryDir(context: Context): File =
    File(context.filesDir, "signatures").apply { if (!exists()) mkdirs() }

  private fun sourceDir(context: Context): File =
    File(context.filesDir, "signature-source").apply { if (!exists()) mkdirs() }

  /** Rasterises whatever was made, and keeps it for next time. */
  fun remember(context: Context, payload: JSONObject): Map<String, Any> {
    val bitmap = render(context, payload)
      ?: throw PdfOpen.PdfFailure("Draw a signature first.", PdfOpen.PdfFailure.Kind.OTHER)

    val target = File(libraryDir(context), "signature-${System.currentTimeMillis()}.png")

    try {
      FileOutputStream(target).use { stream ->
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
      }

      return mapOf(
        "uri" to PdfFiles.toUri(target),
        "createdAt" to target.lastModified(),
      )
    } finally {
      bitmap.recycle()
    }
  }

  fun list(context: Context): List<Map<String, Any>> =
    libraryDir(context)
      .listFiles()
      ?.filter { it.isFile && it.extension.equals("png", true) }
      ?.sortedByDescending { it.lastModified() }
      ?.take(20)
      ?.map {
        mapOf(
          "uri" to PdfFiles.toUri(it),
          "createdAt" to it.lastModified(),
        )
      }
      ?: emptyList()

  fun forget(context: Context, uri: String): Boolean {
    val path = try {
      Uri.parse(uri).path
    } catch (error: Exception) {
      null
    } ?: return false

    val file = File(path)
    if (!file.absolutePath.startsWith(libraryDir(context).absolutePath)) return false

    return file.delete()
  }

  /** True when two boxes overlap at all, used to keep placements on the page. */
  fun overlaps(
    aX: Float,
    aY: Float,
    aWidth: Float,
    aHeight: Float,
    bX: Float,
    bY: Float,
    bWidth: Float,
    bHeight: Float,
  ): Boolean = abs(aX - bX) * 2 < (aWidth + bWidth) && abs(aY - bY) * 2 < (aHeight + bHeight)
}
