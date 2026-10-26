package expo.modules.pdfarena

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.graphics.form.PDFormXObject
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File
import java.util.zip.ZipOutputStream

/**
 * Out of a PDF, or into one.
 *
 * The rendering tools use Android's own PDF renderer rather than the PDF
 * library's, because it is hardware accelerated and its output is what a person
 * sees in any other app. That means decrypting to a temporary file first when
 * the document is locked, since the native renderer cannot take a password.
 */
object PdfConvert {

  /* --------------------------------------------------------- to images --- */

  fun toImages(context: Context, request: PdfRequest): PdfOutcome {
    val format = request.option("format", "png").lowercase()
    val scale = when (request.option("quality", "hd")) {
      "ultra" -> 3.0f
      "standard" -> 1.5f
      else -> 2.0f
    }

    val prepared = prepareForRendering(context, request)

    try {
      val (output, rendered) = ParcelFileDescriptor
        .open(prepared.file, ParcelFileDescriptor.MODE_READ_ONLY)
        .use { descriptor ->
          val renderer = PdfRenderer(descriptor)
          try {
            val chosen = PdfEngine.pages(request.option("pages", "all"), renderer.pageCount)

            val zip = PdfFiles.zip(PdfEngine.output(context, request)) { archive ->
              chosen.forEach { pageNumber ->
                val page = renderer.openPage(pageNumber - 1)
                try {
                  val width = (page.width * scale).toInt().coerceAtLeast(1)
                  val height = (page.height * scale).toInt().coerceAtLeast(1)

                  val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                  try {
                    val canvas = Canvas(bitmap)
                    canvas.drawColor(Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

                    val name = "page-${pageNumber.toString().padStart(3, '0')}.${extensionFor(format)}"
                    PdfFiles.putEntry(archive, name) { stream ->
                      bitmap.compress(compressFor(format), qualityFor(format), stream)
                    }
                  } finally {
                    bitmap.recycle()
                  }
                } finally {
                  page.close()
                }
              }
            }

            zip to chosen.size
          } finally {
            renderer.close()
          }
        }

      return PdfEngine.outcome(output, rendered, "$rendered pages at ${scale}×")
    } finally {
      prepared.cleanup.forEach { PdfFiles.deleteQuietly(it) }
    }
  }

  private fun extensionFor(format: String): String = when (format) {
    "jpeg" -> "jpg"
    "webp" -> "webp"
    else -> "png"
  }

  private fun compressFor(format: String): Bitmap.CompressFormat = when (format) {
    "jpeg" -> Bitmap.CompressFormat.JPEG
    "webp" -> if (Build.VERSION.SDK_INT >= 30) {
      Bitmap.CompressFormat.WEBP_LOSSY
    } else {
      @Suppress("DEPRECATION")
      Bitmap.CompressFormat.WEBP
    }
    else -> Bitmap.CompressFormat.PNG
  }

  private fun qualityFor(format: String): Int = if (format == "png") 100 else 92

  /** A real file the native renderer can open, plus everything to delete after. */
  private class PreparedForRendering(val file: File, val cleanup: List<File>)

  /**
   * The system renderer cannot take a password, so a locked document is
   * decrypted once into the cache and that copy is what gets rendered. It is
   * deleted when the operation ends, whether or not it succeeded.
   */
  private fun prepareForRendering(context: Context, request: PdfRequest): PreparedForRendering {
    val (file, temporary) = PdfFiles.materialize(context, Uri.parse(request.inputUris.first()))
    val cleanup = mutableListOf<File>()
    if (temporary) cleanup.add(file)

    if (request.password.isNullOrEmpty()) return PreparedForRendering(file, cleanup)

    val decrypted = File(PdfFiles.cacheDir(context), "render-${System.nanoTime()}.pdf")
    try {
      PdfOpen.withDocument(file, request.password) { document ->
        document.isAllSecurityToBeRemoved = true
        PdfFiles.save(document, decrypted)
      }
    } catch (error: Throwable) {
      cleanup.forEach { PdfFiles.deleteQuietly(it) }
      throw error
    }

    cleanup.add(decrypted)
    return PreparedForRendering(decrypted, cleanup)
  }

  /* ------------------------------------------------------- from images --- */

  fun fromImages(context: Context, request: PdfRequest): PdfOutcome {
    if (request.inputUris.isEmpty()) {
      throw PdfOpen.PdfFailure("Choose at least one image.", PdfOpen.PdfFailure.Kind.OTHER)
    }

    val a4 = request.option("pageSize", "fit") == "a4"
    val document = PDDocument()

    try {
      request.inputUris.forEach { uri ->
        val (file, temporary) = PdfFiles.materialize(context, Uri.parse(uri))
        try {
          val bitmap = BitmapFactory.decodeFile(file.absolutePath)
            ?: throw PdfOpen.PdfFailure(
              "“${PdfFiles.displayName(context, Uri.parse(uri))}” is not an image this phone can read.",
              PdfOpen.PdfFailure.Kind.UNSUPPORTED,
            )

          val image = JPEGFactory.createFromImage(document, bitmap, 0.85f)

          if (a4) {
            val page = PDPage(PDRectangle.A4)
            document.addPage(page)
            val scale = minOf(
              PDRectangle.A4.width / image.width,
              PDRectangle.A4.height / image.height,
            )
            val drawWidth = image.width * scale
            val drawHeight = image.height * scale
            PDPageContentStream(document, page).use { stream ->
              stream.drawImage(
                image,
                (PDRectangle.A4.width - drawWidth) / 2f,
                (PDRectangle.A4.height - drawHeight) / 2f,
                drawWidth,
                drawHeight,
              )
            }
          } else {
            val page = PDPage(PDRectangle(image.width.toFloat(), image.height.toFloat()))
            document.addPage(page)
            PDPageContentStream(document, page).use { stream ->
              stream.drawImage(image, 0f, 0f, image.width.toFloat(), image.height.toFloat())
            }
          }

          bitmap.recycle()
        } finally {
          if (temporary) PdfFiles.deleteQuietly(file)
        }
      }

      PdfEngine.stamp(document)
      val output = PdfFiles.save(document, PdfEngine.output(context, request))
      PdfEngine.outcome(output, document.numberOfPages, "${document.numberOfPages} images on ${document.numberOfPages} pages")
    } finally {
      document.close()
    }
  }

  /* ----------------------------------------------------------- to a ZIP --- */

  fun toZip(context: Context, request: PdfRequest): PdfOutcome {
    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { source, _ ->
      val chosen = PdfEngine.pages(request.option("pages", "all"), source.numberOfPages)

      val output = PdfFiles.zip(PdfEngine.output(context, request)) { zip ->
        chosen.forEach { pageNumber ->
          val single = PDDocument()
          try {
            single.importPage(source.getPage(pageNumber - 1))
            PdfEngine.stamp(single)
            PdfFiles.putEntry(zip, "page-${pageNumber.toString().padStart(3, '0')}.pdf") { stream ->
              single.save(stream)
            }
          } finally {
            single.close()
          }
        }
      }

      PdfEngine.outcome(output, chosen.size, "${chosen.size} single-page documents")
    }
  }

  /* ------------------------------------------------------ extract images --- */

  fun extractImages(context: Context, request: PdfRequest): PdfOutcome {
    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { document, _ ->
      val chosen = PdfEngine.pages(request.option("pages", "all"), document.numberOfPages)
      val seen = mutableSetOf<Any>()
      var count = 0

      val output = PdfFiles.zip(PdfEngine.output(context, request)) { zip ->
        chosen.forEach { pageNumber ->
          val page = document.getPage(pageNumber - 1)

          fun scan(resources: com.tom_roush.pdfbox.pdmodel.PDResources?) {
            if (resources == null) return

            resources.xObjectNames.forEach { name ->
              val objectUnderName = try {
                resources.getXObject(name)
              } catch (error: Exception) {
                null
              } ?: return@forEach

              when (objectUnderName) {
                is PDImageXObject -> {
                  val key = objectUnderName.cosObject
                  if (!seen.add(key)) return@forEach

                  val bitmap = try {
                    objectUnderName.image
                  } catch (error: Exception) {
                    null
                  } ?: return@forEach

                  // Anything smaller than an icon is noise, not an asset.
                  if (bitmap.width < 32 || bitmap.height < 32) {
                    bitmap.recycle()
                    return@forEach
                  }

                  count += 1
                  val entry = "image-${count.toString().padStart(3, '0')}-p$pageNumber.png"
                  PdfFiles.putEntry(zip, entry) { stream ->
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
                  }
                  bitmap.recycle()
                }

                is PDFormXObject -> scan(objectUnderName.resources)
                else -> Unit
              }
            }
          }

          scan(page.resources)
        }
      }

      if (count == 0) {
        throw PdfOpen.PdfFailure(
          "There are no embedded images in the pages you chose.",
          PdfOpen.PdfFailure.Kind.UNSUPPORTED,
        )
      }

      PdfEngine.outcome(output, chosen.size, "$count images extracted")
    }
  }

  /* -------------------------------------------------------------- text --- */

  fun toText(context: Context, request: PdfRequest): PdfOutcome {
    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { document, _ ->
      val chosen = PdfEngine.pages(request.option("pages", "all"), document.numberOfPages)
      val stripper = PDFTextStripper()
      stripper.sortByPosition = true

      val contiguous = chosen.size == chosen.last() - chosen.first() + 1
      val text = if (contiguous) {
        stripper.startPage = chosen.first()
        stripper.endPage = chosen.last()
        stripper.getText(document)
      } else {
        // "1, 5" is two pages, not the range between them.
        chosen.joinToString("\n\n") { page ->
          stripper.startPage = page
          stripper.endPage = page
          stripper.getText(document).trimEnd()
        } + "\n"
      }
      val output = PdfEngine.output(context, request)
      output.writeText(text, Charsets.UTF_8)

      val words = text.split(Regex("\\s+")).count { it.isNotBlank() }
      if (words == 0) {
        PdfEngine.outcome(
          output,
          0,
          "No text layer found",
          listOf("This looks like a scanned document: the pages are pictures, so there is no text to copy."),
        )
      } else {
        PdfEngine.outcome(output, chosen.size, "$words words from ${chosen.size} pages")
      }
    }
  }
}
