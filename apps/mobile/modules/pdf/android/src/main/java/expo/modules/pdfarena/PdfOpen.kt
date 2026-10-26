package expo.modules.pdfarena

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.rendering.PDFRenderer
import java.io.File

/**
 * Opening documents, and failing in a way the interface can explain.
 *
 * Two rules:
 *  - the caller always gets its temporary file cleaned up, whether the work
 *    succeeds or throws;
 *  - a password error is always distinguishable from a damaged file, because
 *    those two need completely different next steps from the person.
 */
object PdfOpen {

  /** An engine failure with words meant for a person, not a stack trace. */
  class PdfFailure(message: String, val kind: Kind = Kind.OTHER) : Exception(message) {
    enum class Kind { PASSWORD, CORRUPT, RANGE, UNSUPPORTED, OTHER }
  }

  fun load(file: File, password: String?): PDDocument {
    return try {
      if (password.isNullOrEmpty()) PDDocument.load(file) else PDDocument.load(file, password)
    } catch (error: InvalidPasswordException) {
      throw PdfFailure("This document needs its password.", PdfFailure.Kind.PASSWORD)
    } catch (error: Exception) {
      throw PdfFailure(
        "This file could not be read as a PDF. ${error.message ?: ""}".trim(),
        PdfFailure.Kind.CORRUPT,
      )
    }
  }

  /** Runs `work` with the document open, and always closes it. */
  fun <T> withDocument(file: File, password: String?, work: (PDDocument) -> T): T {
    val document = load(file, password)
    return try {
      work(document)
    } finally {
      try {
        document.close()
      } catch (error: Exception) {
        // Closing a damaged document can throw; the result has already been written.
      }
    }
  }

  /** Opens a picked URI, runs the work, and cleans up the temporary copy. */
  fun <T> withInput(
    context: Context,
    uri: String,
    password: String?,
    work: (PDDocument, File) -> T,
  ): T {
    val (file, temporary) = PdfFiles.materialize(context, Uri.parse(uri))
    return try {
      withDocument(file, password) { document -> work(document, file) }
    } finally {
      if (temporary) PdfFiles.deleteQuietly(file)
    }
  }

  fun pageCount(document: PDDocument): Int = document.numberOfPages

  /**
   * Page numbers from a one-based selection, clamped and de-duplicated.
   * The parser has already validated the text; this is the last line of defence
   * so a stale screen cannot make the engine read page 400 of a 3-page file.
   */
  fun pagesFrom(selection: List<Int>, pageCount: Int): List<Int> {
    val pages = selection.filter { it in 1..pageCount }.distinct()
    if (pages.isEmpty()) {
      throw PdfFailure("That page range does not exist in this document.", PdfFailure.Kind.RANGE)
    }
    return pages
  }

  /** Every page, one-based, in order. */
  fun allPages(pageCount: Int): List<Int> = (1..pageCount).toList()

  /**
   * Draws one page into a bitmap, sized so the result is `maxWidth` wide.
   * Used for thumbnails and the viewer; never for export, which needs the
   * fidelity of Android's own renderer.
   */
  fun renderPage(document: PDDocument, pageIndex: Int, maxWidth: Int): Bitmap {
    if (pageIndex < 0 || pageIndex >= document.numberOfPages) {
      throw PdfFailure("This document does not have that page.", PdfFailure.Kind.RANGE)
    }

    val renderer = PDFRenderer(document)
    val box = document.getPage(pageIndex).cropBox ?: document.getPage(pageIndex).mediaBox
    val widthPt = if (box.width > 0) box.width else 612f
    val scale = (maxWidth.toFloat() / widthPt).coerceIn(0.2f, 4f)

    return renderer.renderImage(pageIndex, scale, com.tom_roush.pdfbox.rendering.ImageType.RGB)
  }

  /** Translates this module's failures into the strings the JS side reads. */
  fun messageFor(error: Throwable): String = when (error) {
    is PdfFailure -> when (error.kind) {
      PdfFailure.Kind.PASSWORD -> "password: ${error.message}"
      PdfFailure.Kind.CORRUPT -> "corrupt: ${error.message}"
      PdfFailure.Kind.RANGE -> "page: ${error.message}"
      PdfFailure.Kind.UNSUPPORTED -> "unsupported: ${error.message}"
      PdfFailure.Kind.OTHER -> error.message ?: "Something went wrong."
    }
    else -> error.message ?: "Something went wrong."
  }
}
