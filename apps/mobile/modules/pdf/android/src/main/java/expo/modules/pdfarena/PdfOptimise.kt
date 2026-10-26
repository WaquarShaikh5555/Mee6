package expo.modules.pdfarena

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.graphics.form.PDFormXObject
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import com.tom_roush.pdfbox.rendering.ImageType
import com.tom_roush.pdfbox.rendering.PDFRenderer
import java.io.File

/**
 * Smaller, greyer, repaired, compared.
 */
object PdfOptimise {

  /* ----------------------------------------------------------- compress --- */

  /**
   * Re-encodes the photographs inside the document and nothing else.
   *
   * Text stays text and vectors stay vectors, which is why the result is
   * smaller without going soft: the thing being thrown away is image detail
   * that the eye is least likely to miss at reading size.
   */
  fun compress(context: Context, request: PdfRequest): PdfOutcome {
    val level = request.option("level", "recommended")
    val quality = when (level) {
      "extreme" -> 0.4f
      "light" -> 0.9f
      else -> 0.7f
    }
    val downscale = when (level) {
      "extreme" -> 0.6f
      "light" -> 1.0f
      else -> 0.8f
    }

    val inputFile = PdfFiles.materialize(context, android.net.Uri.parse(request.inputUris.first()))
    val originalSize = PdfFiles.sizeOf(inputFile.first)

    return try {
      PdfOpen.withDocument(inputFile.first, request.password) { document ->
        val replaced = hashMapOf<Any, PDImageXObject>()
        var rewrote = 0

        fun process(resources: com.tom_roush.pdfbox.pdmodel.PDResources?) {
          if (resources == null) return

          resources.xObjectNames.forEach { name ->
            try {
              when (val objectUnderName = resources.getXObject(name)) {
                is PDImageXObject -> {
                  val key = objectUnderName.cosObject
                  val already = replaced[key]
                  if (already != null) {
                    resources.put(name, already)
                    return@forEach
                  }

                  var bitmap = objectUnderName.image ?: return@forEach
                  if (downscale < 1f) {
                    val width = (bitmap.width * downscale).toInt().coerceAtLeast(1)
                    val height = (bitmap.height * downscale).toInt().coerceAtLeast(1)
                    val scaled = Bitmap.createScaledBitmap(bitmap, width, height, true)
                    if (scaled !== bitmap) bitmap.recycle()
                    bitmap = scaled
                  }

                  val replacement = JPEGFactory.createFromImage(document, bitmap, quality)
                  resources.put(name, replacement)
                  replaced[key] = replacement
                  bitmap.recycle()
                  rewrote += 1
                }

                is PDFormXObject -> process(objectUnderName.resources)
                else -> Unit
              }
            } catch (error: Exception) {
              // One unreadable image must not abandon the whole document.
            }
          }
        }

        for (index in 0 until document.numberOfPages) {
          process(document.getPage(index).resources)
        }

        PdfEngine.stamp(document)
        val output = PdfFiles.save(document, PdfEngine.output(context, request))
        val newSize = PdfFiles.sizeOf(output)

        val summary = when {
          rewrote == 0 -> "No embedded images to re-encode — the file was already lean."
          originalSize > 0 && newSize < originalSize ->
            "$rewrote images re-encoded · ${percentSmaller(originalSize, newSize)}"
          else -> "$rewrote images re-encoded"
        }

        PdfEngine.outcome(output, document.numberOfPages, summary)
      }
    } finally {
      if (inputFile.second) PdfFiles.deleteQuietly(inputFile.first)
    }
  }

  private fun percentSmaller(before: Long, after: Long): String {
    val saved = ((before - after) * 100.0 / before).toInt()
    return if (saved > 0) "$saved% smaller" else "size unchanged"
  }

  /* ---------------------------------------------------------- grayscale --- */

  /**
   * Redraws each page in grey. Deliberately flattening: the output is an image
   * of the page, which is what makes it print identically everywhere — and
   * what makes its text unselectable, which the tool's copy says plainly.
   */
  fun grayscale(context: Context, request: PdfRequest): PdfOutcome {
    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { document, _ ->
      val scale = 1.2f
      val renderer = PDFRenderer(document)
      val target = PDDocument()

      try {
        for (index in 0 until document.numberOfPages) {
          val colour = renderer.renderImage(index, scale, ImageType.RGB)
          val grey = toGrey(colour)
          if (grey !== colour) colour.recycle()

          val image = JPEGFactory.createFromImage(target, grey, 0.7f)
          val page = PDPage(PDRectangle(image.width / scale, image.height / scale))
          target.addPage(page)

          PDPageContentStream(target, page).use { stream ->
            stream.drawImage(image, 0f, 0f, page.mediaBox.width, page.mediaBox.height)
          }
          grey.recycle()
        }

        PdfEngine.stamp(target)
        val output = PdfFiles.save(target, PdfEngine.output(context, request))
        PdfEngine.outcome(output, target.numberOfPages, "Flattened to black and white")
      } finally {
        target.close()
      }
    }
  }

  private fun toGrey(source: Bitmap): Bitmap {
    val out = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    // White first: transparent regions would otherwise print as black boxes.
    canvas.drawColor(Color.WHITE)

    val paint = Paint().apply {
      colorFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(0f) })
    }
    canvas.drawBitmap(source, 0f, 0f, paint)
    return out
  }

  /* ------------------------------------------------------------- repair --- */

  fun repair(context: Context, request: PdfRequest): PdfOutcome {
    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { document, _ ->
      document.isAllSecurityToBeRemoved = true

      val warnings = mutableListOf<String>()
      val pages = document.numberOfPages
      if (pages == 0) {
        throw PdfOpen.PdfFailure(
          "This file contains no readable pages.",
          PdfOpen.PdfFailure.Kind.CORRUPT,
        )
      }

      PdfEngine.stamp(document)
      val output = PdfFiles.save(document, PdfEngine.output(context, request))
      PdfEngine.outcome(
        output,
        pages,
        "Rebuilt with $pages ${if (pages == 1) "page" else "pages"}",
        warnings,
      )
    }
  }

  /* ------------------------------------------------------------ compare --- */

  /** How different two pages are: 0 identical, 1 nothing in common. */
  data class Difference(val page: Int, val changed: Double)

  fun compare(context: Context, firstUri: String, firstPassword: String?, secondUri: String, secondPassword: String?): Map<String, Any> {
    val (firstFile, firstTemporary) = PdfFiles.materialize(context, android.net.Uri.parse(firstUri))
    val (secondFile, secondTemporary) = PdfFiles.materialize(context, android.net.Uri.parse(secondUri))

    return try {
      PdfOpen.withDocument(firstFile, firstPassword) { first ->
        PdfOpen.withDocument(secondFile, secondPassword) { second ->
          val firstRenderer = PDFRenderer(first)
          val secondRenderer = PDFRenderer(second)
          val pages = maxOf(first.numberOfPages, second.numberOfPages)
          val differences = mutableListOf<Map<String, Any>>()

          for (index in 0 until pages) {
            val inFirst = index < first.numberOfPages
            val inSecond = index < second.numberOfPages

            val changed = when {
              !inFirst || !inSecond -> 1.0
              else -> {
                val a = firstRenderer.renderImage(index, 0.9f, ImageType.RGB)
                val b = secondRenderer.renderImage(index, 0.9f, ImageType.RGB)
                val value = differenceBetween(a, b)
                a.recycle()
                b.recycle()
                value
              }
            }

            differences.add(mapOf("page" to index + 1, "changed" to changed))
          }

          mapOf(
            "pagesA" to first.numberOfPages,
            "pagesB" to second.numberOfPages,
            "differences" to differences,
          )
        }
      }
    } finally {
      if (firstTemporary) PdfFiles.deleteQuietly(firstFile)
      if (secondTemporary) PdfFiles.deleteQuietly(secondFile)
    }
  }

  private fun differenceBetween(first: Bitmap, second: Bitmap): Double {
    val width = minOf(first.width, second.width)
    val height = minOf(first.height, second.height)
    if (width <= 0 || height <= 0) return 1.0

    val a = Bitmap.createScaledBitmap(first, width, height, true)
    val b = Bitmap.createScaledBitmap(second, width, height, true)

    val aPixels = IntArray(width * height)
    val bPixels = IntArray(width * height)
    a.getPixels(aPixels, 0, width, 0, 0, width, height)
    b.getPixels(bPixels, 0, width, 0, 0, width, height)

    // Sampling every fourth pixel is enough to tell "different" from "same",
    // and quarters the work on a long document.
    var differing = 0
    var sampled = 0
    var index = 0
    while (index < aPixels.size) {
      val left = aPixels[index]
      val right = bPixels[index]
      val delta = maxOf(
        kotlin.math.abs((left shr 16 and 0xFF) - (right shr 16 and 0xFF)),
        kotlin.math.abs((left shr 8 and 0xFF) - (right shr 8 and 0xFF)),
        kotlin.math.abs((left and 0xFF) - (right and 0xFF)),
      )
      if (delta > 24) differing += 1
      sampled += 1
      index += 4
    }

    if (a !== first) a.recycle()
    if (b !== second) b.recycle()

    return if (sampled == 0) 0.0 else differing.toDouble() / sampled.toDouble()
  }
}
