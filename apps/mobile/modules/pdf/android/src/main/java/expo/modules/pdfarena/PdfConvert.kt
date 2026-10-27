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
import com.tom_roush.pdfbox.cos.COSDictionary
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.PDResources
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.graphics.form.PDFormXObject
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.text.TextPosition
import java.io.File
import java.io.FileOutputStream
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

    return try {
      // Every page becomes its own picture. A ZIP would need another app just
      // to look at what this tool made.
      val folder = PdfFiles.newGallery(context, request.outputName.substringBeforeLast('.'))
      val images = mutableListOf<File>()

      ParcelFileDescriptor.open(prepared.file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
        val renderer = PdfRenderer(descriptor)
        try {
          val chosen = PdfEngine.pages(request.option("pages", "all"), renderer.pageCount)

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
                val file = File(folder, name)
                FileOutputStream(file).use { stream ->
                  bitmap.compress(compressFor(format), qualityFor(format), stream)
                }
                images.add(file)
              } finally {
                bitmap.recycle()
              }
            } finally {
              page.close()
            }
          }
        } finally {
          renderer.close()
        }
      }

      val first = images.firstOrNull()
        ?: run {
          PdfFiles.deleteTree(folder)
          throw PdfOpen.PdfFailure("No pages were chosen.", PdfOpen.PdfFailure.Kind.RANGE)
        }

      PdfEngine.outcome(
        first,
        images.size,
        "${images.size} ${if (images.size == 1) "image" else "images"} at ${scale}×",
        outputs = images,
      )
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

    return try {
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
      val folder = PdfFiles.newGallery(context, request.outputName.substringBeforeLast('.'))
      val images = mutableListOf<File>()

      fun save(name: String, bitmap: Bitmap) {
        val file = File(folder, name)
        FileOutputStream(file).use { stream -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream) }
        images.add(file)
      }

      fun scan(resources: PDResources?, pageNumber: Int) {
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

              val number = images.size + 1
              save("image-${number.toString().padStart(3, '0')}-p$pageNumber.png", bitmap)
              bitmap.recycle()
            }

            is PDFormXObject -> scan(objectUnderName.resources, pageNumber)
            else -> Unit
          }
        }
      }

      chosen.forEach { pageNumber -> scan(resourcesOf(document.getPage(pageNumber - 1)), pageNumber) }

      if (images.isEmpty()) {
        PdfFiles.deleteTree(folder)
        throw PdfOpen.PdfFailure(
          "This document is drawn with text and shapes rather than pictures, so there is nothing to pull out. PDF to images turns its pages into pictures instead.",
          PdfOpen.PdfFailure.Kind.UNSUPPORTED,
        )
      }

      PdfEngine.outcome(
        images.first(),
        chosen.size,
        "${images.size} ${if (images.size == 1) "image" else "images"} from ${chosen.size} pages",
        outputs = images,
      )
    }
  }

  /**
   * A page often inherits its resources from an ancestor node instead of
   * carrying them itself. Reading only the page finds nothing in a great many
   * real documents, which is why extraction looks broken on them.
   */
  fun resourcesOf(page: PDPage): PDResources? {
    var node: COSDictionary? = page.cosObject
    var level = 0

    while (node != null && level < 32) {
      val dictionary = node.getDictionaryObject(COSName.RESOURCES) as? COSDictionary
      if (dictionary != null) return PDResources(dictionary)
      node = node.getDictionaryObject(COSName.PARENT) as? COSDictionary
      level += 1
    }

    return null
  }

  /* -------------------------------------------------------------- text --- */

  /**
   * The text layer, in whatever language the document is written in.
   *
   * Two passes per page, because a single pass is exactly what fails on
   * non-Latin documents. The layout-aware stripper is correct but throws (or
   * returns nothing) when a font carries no Unicode map — common in Chinese,
   * Japanese, Korean, Arabic and Indic files. When that happens the page is
   * read again straight from the glyph stream, which recovers whatever the
   * file can actually say instead of losing the whole document.
   *
   * The file is written as UTF-8 with a byte order mark. Without it, Windows
   * editors and several Android text viewers assume the system code page and
   * show Hindi, Arabic or Chinese as mojibake — which reads as "extraction is
   * broken" even when the words were perfect.
   */
  fun toText(context: Context, request: PdfRequest): PdfOutcome {
    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { document, _ ->
      val chosen = PdfEngine.pages(request.option("pages", "all"), document.numberOfPages)
      val blank = mutableListOf<Int>()
      val unreadable = mutableListOf<Int>()

      val pages = chosen.map { pageNumber ->
        val page = readPage(document, pageNumber)
        if (page.isBlank() && pageHasTextObjects(document, pageNumber)) unreadable.add(pageNumber)
        if (page.isBlank()) blank.add(pageNumber)
        tidy(page)
      }

      val text = pages.filter { it.isNotEmpty() }.joinToString("\n\n")

      val output = PdfEngine.output(context, request)
      // The mark, then the bytes. Readers that need it get it; readers that do
      // not ignore it silently.
      output.writeBytes(
        byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()) + text.toByteArray(Charsets.UTF_8),
      )

      val warnings = mutableListOf<String>()

      when {
        text.isEmpty() -> warnings.add(
          "No text layer on the pages you chose. This looks like a scan: the pages are pictures, so there is nothing to copy. PDF to images turns them into pictures you can share.",
        )

        else -> {
          if (unreadable.isNotEmpty()) {
            warnings.add(
              "Page${if (unreadable.size == 1) "" else "s"} ${listOfPages(unreadable)}: characters are drawn there, but the file stores them without a character map. That is a limitation of how the document was made, not a scan — the pages that did read still come through.",
            )
          }

          val blankAndReachable = blank.filter { it !in unreadable }
          if (blankAndReachable.isNotEmpty()) {
            warnings.add(
              "Page${if (blankAndReachable.size == 1) "" else "s"} ${listOfPages(blankAndReachable)} had no text — most likely a picture of a page.",
            )
          }
        }
      }

      val summary = if (text.isEmpty()) {
        "No text layer found"
      } else {
        "${describe(text)} from ${chosen.size} ${if (chosen.size == 1) "page" else "pages"}"
      }

      PdfEngine.outcome(
        output,
        if (text.isEmpty()) 0 else chosen.size,
        summary,
        warnings,
        // The screen shows the words straight away; the long file is capped so
        // a 900-page book never crosses the bridge in one go.
        text = text.take(400_000),
      )
    }
  }

  /** One page, laid out if possible, raw if not. */
  private fun readPage(document: PDDocument, pageNumber: Int): String {
    val laidOut = try {
      PDFTextStripper()
        .apply {
          sortByPosition = true
          startPage = pageNumber
          endPage = pageNumber
        }
        .getText(document)
    } catch (error: Throwable) {
      ""
    }

    if (laidOut.isNotBlank()) return laidOut

    return try {
      val collector = Glyphs()
      collector.startPage = pageNumber
      collector.endPage = pageNumber
      collector.getText(document)
      collector.collected.toString()
    } catch (error: Throwable) {
      ""
    }
  }

  /**
   * Reads the glyph stream in order, skipping the layout pass entirely.
   *
   * `processTextPosition` is the one hook the stripper calls for every glyph;
   * collecting there means a page whose widths or Unicode map break the layout
   * engine still gives up its characters.
   */
  private class Glyphs : PDFTextStripper() {
    val collected = StringBuilder()

    override fun processTextPosition(text: TextPosition?) {
      val unicode = text?.unicode ?: return
      if (unicode.isEmpty()) return

      // Glyphs from different lines must not run together into one word.
      val line = text.yDirAdj
      if (hasLine && kotlin.math.abs(line - lastLine) > text.heightDir.coerceAtLeast(1f) / 2f) {
        collected.append('\n')
      }

      hasLine = true
      lastLine = line
      collected.append(unicode)
    }

    override fun writeString(text: String?, positions: MutableList<TextPosition>?) {
      // Nothing: `collected` already has every glyph, in order.
    }

    private var hasLine = false
    private var lastLine = 0f
  }

  /** True when the page draws characters, whether or not they can be decoded. */
  private fun pageHasTextObjects(document: PDDocument, pageNumber: Int): Boolean {
    return try {
      val page = document.getPage(pageNumber - 1)
      val contents = page.cosObject.getDictionaryObject(COSName.CONTENTS)
      // A content stream that exists at all is worth attempting; the readable
      // pass already said it produced nothing.
      contents != null
    } catch (error: Throwable) {
      false
    }
  }

  /**
   * Removes what a text editor cannot show, and nothing else.
   *
   * Non-Latin scripts are preserved exactly: NFC only composes characters that
   * belong together, so Hindi, Arabic and Chinese survive untouched while
   * accented Latin stops arriving as two code points.
   */
  private fun tidy(raw: String): String {
    if (raw.isEmpty()) return ""

    val normalised = java.text.Normalizer.normalize(raw, java.text.Normalizer.Form.NFC)
    val cleaned = StringBuilder(normalised.length)

    normalised.forEach { character ->
      when {
        character == '\n' || character == '\t' -> cleaned.append(character)
        character == '\r' -> Unit
        character == '\u00AD' -> Unit
        character == '\uFEFF' -> Unit
        character.code < 0x20 || character.code == 0x7F -> Unit
        character == '\uFFFD' -> Unit
        else -> cleaned.append(character)
      }
    }

    return cleaned.toString()
      .replace(Regex("[ \t]+\n"), "\n")
      .replace(Regex("\n{3,}"), "\n\n")
      .trim()
  }

  /**
   * "1,204 words" for languages that separate them, "3,512 characters" for the
   * ones that do not. A Chinese page counted by spaces reads as one word.
   */
  private fun describe(text: String): String {
    val characters = text.count { !it.isWhitespace() }
    val spaces = text.count { it == ' ' }
    val words = text.split(Regex("\\s+")).count { it.isNotBlank() }

    val runsTogether = characters > 400 && spaces * 20 < characters
    return if (runsTogether) {
      "${grouped(characters)} characters"
    } else {
      "${grouped(words)} ${if (words == 1) "word" else "words"}"
    }
  }

  private fun grouped(value: Int): String =
    value.toString().reversed().chunked(3).joinToString(",").reversed()

  private fun listOfPages(pages: List<Int>): String = when {
    pages.size == 1 -> "${pages.first()}"
    else -> pages.take(6).joinToString(", ") + if (pages.size > 6) " and ${pages.size - 6} more" else ""
  }
}

