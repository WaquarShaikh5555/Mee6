package expo.modules.pdfarena

import android.content.Context
import com.tom_roush.pdfbox.pdmodel.PDDocument
import java.io.File

/** One run of one tool. */
data class PdfRequest(
  val toolId: String,
  val inputUris: List<String>,
  val password: String?,
  val options: Map<String, String>,
  val outputName: String
) {
  fun option(key: String, fallback: String = ""): String = options[key]?.trim() ?: fallback

  fun number(key: String, fallback: Int): Int = option(key).toIntOrNull() ?: fallback

  fun flag(key: String, fallback: Boolean = false): Boolean =
    option(key).ifEmpty { if (fallback) "true" else "false" }.equals("true", ignoreCase = true)
}

/**
 * What the app is told when a tool finishes.
 *
 * `outputs` exists because some tools make many files: extracting a document's
 * images should hand back the pictures, not a ZIP the person then has to find
 * an app to open. The first one is also the single `outputUri`, so everything
 * written for one file keeps working.
 *
 * `text` carries a text extraction back to the screen, so the words can be
 * read and copied without leaving the app.
 */
data class PdfOutcome(
  val outputUri: String,
  val outputName: String,
  val sizeBytes: Long,
  val pages: Int,
  val summary: String,
  val warnings: List<String> = emptyList(),
  val outputs: List<String> = emptyList(),
  val text: String? = null
) {
  fun toMap(): Map<String, Any> {
    val map = mutableMapOf<String, Any>(
      "outputUri" to outputUri,
      "outputName" to outputName,
      "sizeBytes" to sizeBytes,
      "pages" to pages,
      "summary" to summary,
      "warnings" to warnings,
      "outputUris" to if (outputs.isEmpty()) listOf(outputUri) else outputs
    )

    // Absent rather than null: a null inside the map is a needless edge for the
    // bridge to carry, and the screen treats a missing text as "none".
    val words = text
    if (words != null) map["text"] = words

    return map
  }
}

/**
 * The dispatcher.
 *
 * Every tool arrives as an id and a bag of options. This decides which
 * implementation runs, and gives each one the two things it always needs: the
 * app's context (for storage) and a place to put its result.
 *
 * Keeping the dispatch in one `when` means the feature's whole surface is
 * visible in one screen of code — which is also how the parity table in
 * `docs/PDF-ARENA.md` stays honest.
 */
object PdfEngine {

  fun run(context: Context, request: PdfRequest): PdfOutcome {
    if (request.inputUris.isEmpty()) {
      throw PdfOpen.PdfFailure("Choose a file first.", PdfOpen.PdfFailure.Kind.OTHER)
    }

    return when (request.toolId) {
      // Edit
      "merge" -> PdfEdit.merge(context, request)
      "split" -> PdfEdit.split(context, request)
      "delete" -> PdfEdit.deletePages(context, request)
      "rearrange" -> PdfEdit.rearrange(context, request)
      "rotate" -> PdfEdit.rotate(context, request)
      "sign" -> PdfEdit.sign(context, request)
      "watermark" -> PdfEdit.watermark(context, request)
      "page-numbers" -> PdfEdit.pageNumbers(context, request)
      "bookmarks" -> PdfEdit.bookmarks(context, request)

      // Optimise
      "compress" -> PdfOptimise.compress(context, request)
      "grayscale" -> PdfOptimise.grayscale(context, request)
      "repair" -> PdfOptimise.repair(context, request)

      // Secure
      "protect" -> PdfSecure.protect(context, request)
      "unlock" -> PdfSecure.unlock(context, request)
      "metadata" -> PdfSecure.metadata(context, request)

      // Convert
      "pdf2img" -> PdfConvert.toImages(context, request)
      "img2pdf" -> PdfConvert.fromImages(context, request)
      "pdf2zip" -> PdfConvert.toZip(context, request)
      "extract-images" -> PdfConvert.extractImages(context, request)
      "pdf2text" -> PdfConvert.toText(context, request)

      else -> throw PdfOpen.PdfFailure(
        "There is no tool called “${request.toolId}”.",
        PdfOpen.PdfFailure.Kind.UNSUPPORTED,
      )
    }
  }

  /* --------------------------------------------------------- shared bits --- */

  /**
   * Pages named by the screen: `all`, `3`, `1-4, 7`, or the shorthand `-4` for
   * "the first four". Anything unusable becomes "every page" rather than a
   * surprise.
   *
   * This mirrors `parseRange` in `src/pdf/ranges.ts`. The JavaScript parser is
   * the one that explains mistakes to the person; this is the engine's own
   * guard, so a stale or hand-made string can never reach a page that does not
   * exist.
   */
  fun pages(selection: String, pageCount: Int): List<Int> {
    val text = selection.trim().lowercase()
    if (text.isEmpty() || text == "all" || text == "*") return PdfOpen.allPages(pageCount)

    val chosen = linkedSetOf<Int>()
    fun add(page: Int) {
      if (page in 1..pageCount) chosen.add(page)
    }

    val range = Regex("^(\\d*)[-\u2013\u2014](\\d*)$")
    val single = Regex("^\\d+$")

    text.split(',', ';', ' ')
      .map { it.trim() }
      .filter { it.isNotEmpty() }
      .forEach { token ->
        val pair = range.matchEntire(token)

        when {
          pair != null -> {
            val from = if (pair.groupValues[1].isEmpty()) 1 else pair.groupValues[1].toIntOrNull()
            val to = if (pair.groupValues[2].isEmpty()) pageCount else pair.groupValues[2].toIntOrNull()
            if (from == null || to == null || from < 1 || to > pageCount || from > to) return@forEach
            (from..to).forEach { add(it) }
          }

          single.matches(token) -> add(token.toInt())
        }
      }

    return chosen.toList().ifEmpty { PdfOpen.allPages(pageCount) }
  }

  /** Builds the result, so every tool reports the same shape. */
  fun outcome(
    file: File,
    pages: Int,
    summary: String,
    warnings: List<String> = emptyList(),
    outputs: List<File> = emptyList(),
    text: String? = null
  ): PdfOutcome {
    val all = outputs.ifEmpty { listOf(file) }
    val total = all.sumOf { PdfFiles.sizeOf(it) }

    return PdfOutcome(
      outputUri = PdfFiles.toUri(file),
      outputName = file.name,
      sizeBytes = if (total > 0) total else PdfFiles.sizeOf(file),
      pages = pages,
      summary = summary,
      warnings = warnings,
      outputs = all.map { PdfFiles.toUri(it) },
      text = text
    )
  }

  /** Metadata defaults that mark the tool without claiming authorship. */
  fun stamp(document: PDDocument) {
    val info = document.documentInformation
    if (info.creator.isNullOrBlank()) info.creator = "Shaikh's PDF Arena"
    if (info.producer.isNullOrBlank()) info.producer = "Shaikh's PDF Arena"
  }

  fun output(context: Context, request: PdfRequest): File =
    PdfFiles.newOutput(context, request.outputName)
}
