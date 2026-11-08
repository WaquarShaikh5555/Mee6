package expo.modules.pdfarena

import android.content.Context
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import com.tom_roush.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState
import com.tom_roush.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline
import com.tom_roush.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem
import com.tom_roush.pdfbox.util.Matrix
import org.json.JSONArray
import java.io.File
import java.util.zip.ZipOutputStream

/**
 * The nine tools that change pages or draw on them.
 *
 * All of them share one property worth stating: the original file is never
 * opened for writing. A result is a new file, so a mistake costs a tap, not a
 * document.
 */
object PdfEdit {

  /* -------------------------------------------------------------- merge --- */

  fun merge(context: Context, request: PdfRequest): PdfOutcome {
    if (request.inputUris.size < 2) {
      throw PdfOpen.PdfFailure("Merge needs at least two documents.", PdfOpen.PdfFailure.Kind.OTHER)
    }

    val target = PDDocument()
    var total = 0
    val unreadable = mutableListOf<String>()

    try {
      for (uri in request.inputUris) {
        val (file, temporary) = PdfFiles.materialize(context, android.net.Uri.parse(uri))
        try {
          PdfOpen.withDocument(file, request.password) { source ->
            for (index in 0 until source.numberOfPages) {
              target.importPage(source.getPage(index))
              total += 1
            }
          }
        } catch (error: PdfOpen.PdfFailure) {
          // One unreadable file should not discard the rest; say which one.
          unreadable.add(PdfFiles.displayName(context, android.net.Uri.parse(uri)))
        } finally {
          if (temporary) PdfFiles.deleteQuietly(file)
        }
      }

      if (total == 0) {
        throw PdfOpen.PdfFailure(
          "None of those files could be read.",
          PdfOpen.PdfFailure.Kind.CORRUPT,
        )
      }

      PdfEngine.stamp(target)
      val output = PdfFiles.save(target, PdfEngine.output(context, request))
      return PdfEngine.outcome(
        output,
        total,
        "$total pages from ${request.inputUris.size - unreadable.size} documents",
        unreadable.map { "Skipped “$it” — it could not be read." },
      )
    } finally {
      target.close()
    }
  }

  /* -------------------------------------------------------------- split --- */

  fun split(context: Context, request: PdfRequest): PdfOutcome {
    val separate = request.option("mode", "single") == "separate"

    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { source, _ ->
      val count = source.numberOfPages
      val chosen = PdfEngine.pages(request.option("pages", "all"), count)

      if (!separate) {
        val target = PDDocument()
        try {
          chosen.forEach { target.importPage(source.getPage(it - 1)) }
          PdfEngine.stamp(target)
          val output = PdfFiles.save(target, PdfEngine.output(context, request))
          PdfEngine.outcome(output, chosen.size, "${chosen.size} pages extracted")
        } finally {
          target.close()
        }
      } else {
        val output = PdfFiles.zip(PdfEngine.output(context, request)) { zip ->
          chosen.forEach { pageNumber ->
            val single = PDDocument()
            try {
              single.importPage(source.getPage(pageNumber - 1))
              PdfEngine.stamp(single)
              PdfFiles.putEntry(zip, "page-$pageNumber.pdf") { stream -> single.save(stream) }
            } finally {
              single.close()
            }
          }
        }
        PdfEngine.outcome(output, chosen.size, "${chosen.size} single-page documents")
      }
    }
  }

  /* ------------------------------------------------------------- delete --- */

  fun deletePages(context: Context, request: PdfRequest): PdfOutcome {
    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { source, _ ->
      val count = source.numberOfPages
      val named = request.option("pages")

      // An empty range means "every page" to the parser, which for this tool
      // would mean deleting the document. Ask for the pages instead.
      if (named.isEmpty() || named == "all" || named == "*") {
        throw PdfOpen.PdfFailure(
          "Name the pages to remove. Everything you do not name is kept.",
          PdfOpen.PdfFailure.Kind.RANGE,
        )
      }

      val removed = PdfEngine.pages(named, count).toSet()
      val kept = (1..count).filter { it !in removed }

      if (kept.isEmpty()) {
        throw PdfOpen.PdfFailure(
          "That would remove every page.",
          PdfOpen.PdfFailure.Kind.RANGE,
        )
      }

      val target = PDDocument()
      try {
        kept.forEach { target.importPage(source.getPage(it - 1)) }
        PdfEngine.stamp(target)
        val output = PdfFiles.save(target, PdfEngine.output(context, request))
        PdfEngine.outcome(
          output,
          kept.size,
          "${removed.size} removed, ${kept.size} kept",
        )
      } finally {
        target.close()
      }
    }
  }

  /* ---------------------------------------------------------- rearrange --- */

  fun rearrange(context: Context, request: PdfRequest): PdfOutcome {
    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { source, _ ->
      val count = source.numberOfPages
      val order = request.option("order")
        .split(',')
        .mapNotNull { it.trim().toIntOrNull() }
        .filter { it in 1..count }

      if (order.isEmpty()) {
        throw PdfOpen.PdfFailure(
          "Choose the pages in the order you want them.",
          PdfOpen.PdfFailure.Kind.RANGE,
        )
      }

      val target = PDDocument()
      try {
        order.forEach { target.importPage(source.getPage(it - 1)) }
        PdfEngine.stamp(target)
        val output = PdfFiles.save(target, PdfEngine.output(context, request))
        val dropped = count - order.size
        PdfEngine.outcome(
          output,
          order.size,
          if (dropped > 0) "${order.size} pages, $dropped dropped" else "${order.size} pages reordered",
        )
      } finally {
        target.close()
      }
    }
  }

  /* ------------------------------------------------------------- rotate --- */

  fun rotate(context: Context, request: PdfRequest): PdfOutcome {
    val angle = ((request.number("angle", 90) % 360) + 360) % 360

    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { document, _ ->
      val chosen = PdfEngine.pages(request.option("pages", "all"), document.numberOfPages)

      chosen.forEach { pageNumber ->
        val page = document.getPage(pageNumber - 1)
        page.rotation = ((page.rotation + angle) % 360 + 360) % 360
      }

      PdfEngine.stamp(document)
      val output = PdfFiles.save(document, PdfEngine.output(context, request))
      PdfEngine.outcome(
        output,
        document.numberOfPages,
        "${chosen.size} turned by ${angle}°",
      )
    }
  }

  /* --------------------------------------------------------------- sign --- */

  fun sign(context: Context, request: PdfRequest): PdfOutcome {
    val payload = org.json.JSONObject(request.option("signature").ifEmpty { "{}" })

    val bitmap = PdfSignatures.render(context, payload)
      ?: throw PdfOpen.PdfFailure(
        "Draw your signature, or choose a photo of it, before signing.",
        PdfOpen.PdfFailure.Kind.OTHER,
      )

    val placements = PdfSignatures.placements(payload)

    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { document, _ ->
      val total = document.numberOfPages

      val chosen = placements
        .filter { it.page in 1..total }
        .ifEmpty {
          // The screen always sends one, but a hand-made request should sign
          // rather than silently do nothing.
          listOf(PdfSignatures.Placement(page = 1, x = 0.5f, y = 0.12f, width = 0.32f, rotation = 0f))
        }

      val image = LosslessFactory.createFromImage(document, bitmap)

      try {
        chosen.forEach { placement ->
          val page = document.getPage(placement.page - 1)
          PdfSignatures.draw(document, page, image, bitmap, placement)
        }

        PdfEngine.stamp(document)
        val output = PdfFiles.save(document, PdfEngine.output(context, request))
        val pages = chosen.map { it.page }.distinct().size

        PdfEngine.outcome(
          output,
          document.numberOfPages,
          "Signed on $pages ${if (pages == 1) "page" else "pages"}",
        )
      } finally {
        bitmap.recycle()
      }
    }
  }

  /**
   * An ink chosen in the interface, or a readable fallback.
   *
   * The colour arrives as `#RRGGBB`; PDF wants its channels apart, and a bad
   * value must not take the whole tool down.
   */
  private fun ink(value: String, fallback: Int): Int {
    return try {
      if (value.length == 7 && value.startsWith("#")) {
        android.graphics.Color.parseColor(value)
      } else {
        fallback
      }
    } catch (error: Exception) {
      fallback
    }
  }

  /* ---------------------------------------------------------- watermark --- */

  fun watermark(context: Context, request: PdfRequest): PdfOutcome {
    val text = request.option("text").ifEmpty { "Confidential" }
    val opacity = request.number("opacity", 20).coerceIn(5, 100) / 100f
    val angle = request.number("angle", 45)
    val size = request.number("size", 56).coerceIn(12, 200).toFloat()
    val radians = Math.toRadians(angle.toDouble())
    val chosenInk = ink(request.option("colour"), android.graphics.Color.rgb(110, 110, 110))

    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { document, _ ->
      val chosen = PdfEngine.pages(request.option("pages", "all"), document.numberOfPages)
      val font = PDType1Font.HELVETICA_BOLD
      val shown = centred(text)

      chosen.forEach { pageNumber ->
        val page = document.getPage(pageNumber - 1)
        val box = page.cropBox ?: page.mediaBox
        val available = box.width * 0.86f

        // One long word on a narrow page: shrink it until it fits, then draw.
        val natural = font.getStringWidth(shown) / 1000f * size
        val fontSize = if (natural > available && natural > 0f) {
          (size * available / natural).coerceAtLeast(6f)
        } else {
          size
        }
        val width = font.getStringWidth(shown) / 1000f * fontSize

        val centreX = box.lowerLeftX + box.width / 2f
        val centreY = box.lowerLeftY + box.height / 2f

        PDPageContentStream(document, page, PDPageContentStream.AppendMode.APPEND, true, true)
          .use { stream ->
            stream.saveGraphicsState()

            val state = PDExtendedGraphicsState()
            state.nonStrokingAlphaConstant = opacity
            state.strokingAlphaConstant = opacity
            stream.setGraphicsStateParameters(state)

            stream.beginText()
            stream.setFont(font, fontSize)
            stream.setNonStrokingColor(
              android.graphics.Color.red(chosenInk),
              android.graphics.Color.green(chosenInk),
              android.graphics.Color.blue(chosenInk),
            )
            // Rotate about the page's centre, then step back half the width so
            // the *middle* of the words sits on that point.
            stream.setTextMatrix(Matrix.getRotateInstance(radians, centreX, centreY))
            stream.newLineAtOffset(-width / 2f, -fontSize * 0.35f)
            stream.showText(shown)
            stream.endText()

            stream.restoreGraphicsState()
          }
      }

      PdfEngine.stamp(document)
      val output = PdfFiles.save(document, PdfEngine.output(context, request))
      PdfEngine.outcome(
        output,
        document.numberOfPages,
        "Watermarked ${chosen.size} ${if (chosen.size == 1) "page" else "pages"}",
      )
    }
  }

  /** PDF standard fonts win an exception on characters outside Latin-1. */
  private fun centred(text: String): String = text.replace(Regex("[^\\x20-\\x7E]"), "?")

  /* ------------------------------------------------------- page numbers --- */

  fun pageNumbers(context: Context, request: PdfRequest): PdfOutcome {
    val format = request.option("format", "Page {n} of {total}")
    val position = request.option("position", "bottom-right")
    val start = request.number("start", 1)
    val size = request.number("size", 10).coerceIn(6, 32).toFloat()
    val chosenInk = ink(request.option("colour"), android.graphics.Color.rgb(70, 70, 70))

    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { document, _ ->
      val count = document.numberOfPages
      val font = PDType1Font.HELVETICA

      for (index in 0 until count) {
        val page = document.getPage(index)
        val box = page.cropBox ?: page.mediaBox
        val text = format
          .replace("{n}", (start + index).toString())
          .replace("{total}", (start + count - 1).toString())

        val width = font.getStringWidth(centred(text)) / 1000f * size
        val margin = 28f

        val left = box.lowerLeftX
        val bottom = box.lowerLeftY

        val x = when {
          position.endsWith("left") -> left + margin
          position.endsWith("center") -> left + (box.width - width) / 2f
          else -> left + box.width - margin - width
        }
        val y = if (position.startsWith("top")) bottom + box.height - margin else bottom + margin

        PDPageContentStream(document, page, PDPageContentStream.AppendMode.APPEND, true, true)
          .use { stream ->
            stream.beginText()
            stream.setFont(font, size)
            stream.setNonStrokingColor(
              android.graphics.Color.red(chosenInk),
              android.graphics.Color.green(chosenInk),
              android.graphics.Color.blue(chosenInk),
            )
            stream.newLineAtOffset(x, y)
            stream.showText(centred(text))
            stream.endText()
          }
      }

      PdfEngine.stamp(document)
      val output = PdfFiles.save(document, PdfEngine.output(context, request))
      PdfEngine.outcome(output, count, "Numbered $count pages")
    }
  }

  /* ---------------------------------------------------------- bookmarks --- */

  fun bookmarks(context: Context, request: PdfRequest): PdfOutcome {
    val raw = request.option("bookmarks", "[]")

    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { document, _ ->
      val entries = try {
        val array = JSONArray(raw)
        (0 until array.length()).mapNotNull { index ->
          val item = array.optJSONObject(index) ?: return@mapNotNull null
          val title = item.optString("title").trim()
          val page = item.optInt("page")
          if (title.isEmpty() || page < 1 || page > document.numberOfPages) null else title to page
        }
      } catch (error: Exception) {
        emptyList<Pair<String, Int>>()
      }

      if (entries.isEmpty()) {
        document.documentCatalog.documentOutline = null
        PdfEngine.stamp(document)
        val output = PdfFiles.save(document, PdfEngine.output(context, request))
        return@withInput PdfEngine.outcome(output, document.numberOfPages, "Bookmarks cleared")
      }

      val outline = PDDocumentOutline()
      document.documentCatalog.documentOutline = outline

      entries.forEach { (title, pageNumber) ->
        val item = PDOutlineItem()
        item.title = title
        item.setDestination(document.getPage(pageNumber - 1))
        outline.addLast(item)
      }

      PdfEngine.stamp(document)
      val output = PdfFiles.save(document, PdfEngine.output(context, request))
      PdfEngine.outcome(output, document.numberOfPages, "${entries.size} bookmarks written")
    }
  }

  /** Reads the existing outline so the bookmarks screen can show it. */
  fun readOutline(document: PDDocument): List<Map<String, Any>> {
    val outline = document.documentCatalog.documentOutline ?: return emptyList()
    val found = mutableListOf<Map<String, Any>>()

    fun visit(item: PDOutlineItem?) {
      var current = item
      var guard = 0
      while (current != null && guard < 500) {
        guard += 1
        val page = try {
          current.findDestinationPage(document)
        } catch (error: Exception) {
          null
        }
        if (page != null) {
          val index = document.pages.indexOf(page)
          found.add(mapOf("title" to (current.title ?: "Untitled"), "page" to index + 1))
        }
        if (current.firstChild != null) visit(current.firstChild)
        current = current.nextSibling
      }
    }

    visit(outline.firstChild)
    return found
  }
}
