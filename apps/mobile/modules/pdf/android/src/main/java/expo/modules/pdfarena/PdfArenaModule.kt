package expo.modules.pdfarena

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.util.Base64
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.text.TextPosition
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.math.abs
import kotlin.math.max

/**
 * The bridge between PDF Arena's screens and its engine.
 *
 * Every method is one thing a screen can ask for. The work itself lives in
 * `PdfEngine` and the files beside it, which are plain Kotlin and know nothing
 * about React Native.
 *
 * Failures are re-thrown with a prefix (`password:`, `corrupt:`, `page:`,
 * `unsupported:`) so `src/pdf/engine.ts` can turn them into the right next step
 * — a password prompt, a page-range correction, or an honest "this file is
 * damaged".
 */
class PdfArenaModule : Module() {

  private val context: Context
    get() = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("PDF Arena needs a running app context")

  private var libraryReady = false

  /**
   * PdfBox-Android needs its bundled fonts and CMaps registered before it reads
   * anything. Doing it here as well as in `OnCreate` means a module created
   * before the React context existed still works.
   */
  private fun ensureReady(ctx: Context) {
    if (libraryReady) return
    PDFBoxResourceLoader.init(ctx)
    PdfFiles.pruneCache(ctx)
    libraryReady = true
  }

  /** Runs one operation, and makes sure its failure arrives with its prefix. */
  private inline fun <T> attempt(work: () -> T): T {
    return try {
      ensureReady(context)
      work()
    } catch (failure: Throwable) {
      throw Exception(PdfOpen.messageFor(failure))
    }
  }

  override fun definition() = ModuleDefinition {
    Name("PdfArena")

    OnCreate {
      appContext.reactContext?.applicationContext?.let { ensureReady(it) }
    }

    /** Page count, size, title, and whether a password is needed. */
    AsyncFunction("probe") { uri: String, password: String? ->
      attempt {
        val (file, temporary) = PdfFiles.materialize(context, Uri.parse(uri))
        try {
          try {
            PdfOpen.withDocument(file, password) { document ->
              mapOf(
                "pages" to document.numberOfPages,
                "encrypted" to document.isEncrypted,
                "needsPassword" to false,
                "sizeBytes" to PdfFiles.sizeOf(file),
                "title" to (document.documentInformation.title ?: ""),
                "author" to (document.documentInformation.author ?: "")
              )
            }
          } catch (failure: PdfOpen.PdfFailure) {
            if (failure.kind != PdfOpen.PdfFailure.Kind.PASSWORD) throw failure

            // Not a failure to the caller: it is the question to ask.
            mapOf(
              "pages" to 0,
              "encrypted" to true,
              "needsPassword" to true,
              "sizeBytes" to PdfFiles.sizeOf(file),
              "title" to "",
              "author" to ""
            )
          }
        } finally {
          if (temporary) PdfFiles.deleteQuietly(file)
        }
      }
    }

    AsyncFunction("process") { request: Map<String, Any?> ->
      attempt {
        val toolId = request["toolId"] as? String ?: ""
        val uris = (request["inputUris"] as? List<*>)?.filterIsInstance<String>() ?: emptyList()
        val password = request["password"] as? String
        val options = (request["options"] as? Map<*, *>)
          ?.entries
          ?.filter { it.key is String && it.value != null }
          ?.associate { (it.key as String) to it.value.toString() }
          ?: emptyMap()

        PdfEngine
          .run(
            context,
            PdfRequest(
              toolId = toolId,
              inputUris = uris,
              password = password?.takeIf { it.isNotEmpty() },
              options = options,
              outputName = request["outputName"] as? String ?: "result.pdf"
            )
          )
          .toMap()
      }
    }

    /** One page, as a PNG the viewer can show. Zero-based page index. */
    AsyncFunction("renderPage") { uri: String, page: Int, maxWidth: Int, password: String? ->
      attempt {
        val (file, temporary) = PdfFiles.materialize(context, Uri.parse(uri))
        try {
          PdfOpen.withDocument(file, password) { document ->
            val bitmap = PdfOpen.renderPage(document, page, maxWidth)
            try {
              val stream = ByteArrayOutputStream()
              bitmap.compress(Bitmap.CompressFormat.PNG, 92, stream)

              mapOf(
                "data" to Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP),
                "width" to bitmap.width,
                "height" to bitmap.height
              )
            } finally {
              bitmap.recycle()
            }
          }
        } finally {
          if (temporary) PdfFiles.deleteQuietly(file)
        }
      }
    }

    /** Every occurrence of a query, with boxes the viewer can draw. */
    AsyncFunction("findText") { uri: String, query: String, password: String? ->
      attempt {
        if (query.isBlank()) {
          emptyList<Map<String, Any>>()
        } else {
          val (file, temporary) = PdfFiles.materialize(context, Uri.parse(uri))
          try {
            PdfOpen.withDocument(file, password) { document ->
              collectMatches(document, query.trim())
            }
          } finally {
            if (temporary) PdfFiles.deleteQuietly(file)
          }
        }
      }
    }

    AsyncFunction("readBookmarks") { uri: String, password: String? ->
      attempt {
        val (file, temporary) = PdfFiles.materialize(context, Uri.parse(uri))
        try {
          PdfOpen.withDocument(file, password) { document -> PdfEdit.readOutline(document) }
        } finally {
          if (temporary) PdfFiles.deleteQuietly(file)
        }
      }
    }

    AsyncFunction("compare") { firstUri: String, secondUri: String, firstPassword: String?, secondPassword: String? ->
      attempt { PdfOptimise.compare(context, firstUri, firstPassword, secondUri, secondPassword) }
    }

    AsyncFunction("print") { uri: String, jobName: String, password: String? ->
      attempt {
        if (appContext.currentActivity == null) {
          throw PdfOpen.PdfFailure("Printing needs the app to be open.", PdfOpen.PdfFailure.Kind.OTHER)
        }

        val (file, temporary) = PdfFiles.materialize(context, Uri.parse(uri))
        val printable = try {
          if (password.isNullOrEmpty()) {
            file
          } else {
            val decrypted = File(PdfFiles.cacheDir(context), "print-${System.nanoTime()}.pdf")
            PdfOpen.withDocument(file, password) { document ->
              document.isAllSecurityToBeRemoved = true
              PdfFiles.save(document, decrypted)
            }
            if (temporary) PdfFiles.deleteQuietly(file)
            // Left on disk: the print system reads it after this call returns.
            decrypted
          }
        } catch (failure: Throwable) {
          if (temporary) PdfFiles.deleteQuietly(file)
          throw failure
        }

        // PrintManager wants the Activity that owns the job; the application
        // context makes the system print dialog fail to attach on some builds.
        val activity = appContext.currentActivity
          ?: throw PdfOpen.PdfFailure("Printing needs the app to be open.", PdfOpen.PdfFailure.Kind.OTHER)
        val manager = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
        manager.print(jobName.ifBlank { printable.name }, PrintPdfAdapter(printable), null)

        // The job runs after this returns; hand the screen nothing to wait on.
        Unit
      }
    }

    /**
     * A photo of a signature on paper, made usable as one.
     *
     * Cropped to the ink, with the paper turned transparent, so what lands on
     * the page is handwriting rather than a white rectangle.
     */
    AsyncFunction("prepareSignatureImage") { uri: String ->
      attempt { PdfSignatures.fromPhoto(context, uri) }
    }

    /** Keeps a signature on this phone, as a picture at pen resolution. */
    AsyncFunction("saveSignature") { payloadJson: String ->
      attempt {
        PdfSignatures.remember(context, org.json.JSONObject(payloadJson.ifEmpty { "{}" }))
      }
    }

    /** Everything kept, newest first. */
    AsyncFunction("loadSignatures") {
      attempt { PdfSignatures.list(context) }
    }

    AsyncFunction("deleteSignature") { uri: String ->
      attempt { PdfSignatures.forget(context, uri) }
    }

    /**
     * Puts one or more results in the phone's Downloads folder.
     *
     * A tool that makes forty pictures puts them in one folder named after the
     * document, so the phone's Files app shows a folder rather than a mess.
     */
    AsyncFunction("saveToDownloads") { uris: List<String>, name: String, folder: String? ->
      attempt {
        if (uris.isEmpty()) {
          throw PdfOpen.PdfFailure("There is nothing to save.", PdfOpen.PdfFailure.Kind.OTHER)
        }

        val saved = mutableListOf<String>()

        uris.forEachIndexed { index, uri ->
          val displayName = if (uris.size == 1 || index == 0) {
            name
          } else {
            // Keep the engine's names for the rest: page-002.png, image-003.png.
            Uri.decode(Uri.parse(uri).lastPathSegment ?: "result-$index")
          }

          saved.add(
            PdfFiles.saveToDownloads(
              context,
              Uri.parse(uri),
              if (uris.size == 1) name else displayName,
              if (uris.size == 1) null else folder,
            ),
          )
        }

        mapOf(
          "saved" to saved.size,
          "where" to if (uris.size == 1) saved.first() else "Download/Shaikh's/${folder ?: name}",
        )
      }
    }

    /** Deletes a result this module created, and refuses anything else. */
    AsyncFunction("deleteOutput") { uri: String ->
      attempt {
        val path = Uri.parse(uri).path
        if (path != null) {
          val root = PdfFiles.outputDir(context)
          val file = File(path)
          if (file.absolutePath.startsWith(root.absolutePath)) {
            // A gallery result is a folder; a single result is a file. Both go.
            PdfFiles.deleteTree(file)

            val parent = file.parentFile
            if (parent != null &&
              parent.absolutePath != root.absolutePath &&
              parent.absolutePath.startsWith(root.absolutePath) &&
              parent.listFiles()?.isEmpty() == true
            ) {
              PdfFiles.deleteQuietly(parent)
            }
          }
        }
      }
    }
  }

  /* ------------------------------------------------------------- search --- */

  /**
   * Text matches with normalised rectangles, so the viewer can outline the
   * words on the rendered page.
   *
   * A match can span lines; each line becomes its own rectangle, which is how
   * every PDF reader draws it. A `TextPosition` can stand for several
   * characters at once (ligatures, run-length spaces), so the text is expanded
   * to one entry per character before indexing by match offset.
   */
  private fun collectMatches(document: PDDocument, query: String): List<Map<String, Any>> {
    val matches = mutableListOf<Map<String, Any>>()

    val stripper = object : PDFTextStripper() {
      override fun writeString(text: String?, positions: MutableList<TextPosition>?) {
        if (text == null || positions == null || text.isEmpty()) return

        val expanded = ArrayList<TextPosition>(text.length)
        positions.forEach { position ->
          repeat(max(1, position.unicode.length)) { expanded.add(position) }
        }

        var index = text.indexOf(query, 0, ignoreCase = true)
        while (index >= 0) {
          val end = index + query.length - 1

          if (end in expanded.indices) {
            val lines = mutableListOf<MutableList<TextPosition>>()
            var lineY = Float.NaN

            expanded.subList(index, end + 1).forEach { position ->
              val crossing = lines.isEmpty() || abs(position.yDirAdj - lineY) >
                max(position.heightDir, 1f) / 2f
              if (crossing) {
                lines.add(mutableListOf())
                lineY = position.yDirAdj
              }
              lines.last().add(position)
            }

            val rects = lines.mapNotNull { line ->
              if (line.isEmpty()) return@mapNotNull null

              val pageWidth = line.first().pageWidth
              val pageHeight = line.first().pageHeight
              if (pageWidth <= 0f || pageHeight <= 0f) return@mapNotNull null

              var minX = Float.MAX_VALUE
              var maxX = -Float.MAX_VALUE
              var minY = Float.MAX_VALUE
              var maxY = -Float.MAX_VALUE

              line.forEach { position ->
                minX = minOf(minX, position.xDirAdj)
                maxX = maxOf(maxX, position.xDirAdj + position.widthDirAdj)
                minY = minOf(minY, position.yDirAdj - position.heightDir * 1.25f)
                maxY = maxOf(maxY, position.yDirAdj)
              }

              val left = (minX / pageWidth).coerceIn(0f, 1f)
              val top = (minY / pageHeight).coerceIn(0f, 1f)
              val right = (maxX / pageWidth).coerceIn(0f, 1f)
              val bottom = (maxY / pageHeight).coerceIn(0f, 1f)

              if (right <= left || bottom <= top) {
                null
              } else {
                mapOf(
                  "x" to left,
                  "y" to top,
                  "w" to (right - left),
                  "h" to (bottom - top)
                )
              }
            }

            if (rects.isNotEmpty()) {
              val from = (index - 28).coerceAtLeast(0)
              val to = (index + query.length + 28).coerceAtMost(text.length)

              matches.add(
                mapOf(
                  "page" to (currentPageNo - 1),
                  "snippet" to text.substring(from, to).trim(),
                  "rects" to rects
                )
              )
            }
          }

          index = text.indexOf(query, index + 1, ignoreCase = true)
        }
      }
    }

    stripper.sortByPosition = true
    stripper.getText(document)
    return matches
  }

  /**
   * Printing is a file copy: Android turns the PDF into a print job itself, so
   * the output is the document as it is, not a re-render of it.
   */
  private class PrintPdfAdapter(private val file: File) : PrintDocumentAdapter() {
    override fun onLayout(
      oldAttributes: PrintAttributes?,
      newAttributes: PrintAttributes?,
      cancellationSignal: CancellationSignal?,
      callback: LayoutResultCallback?,
      extras: Bundle?
    ) {
      if (cancellationSignal?.isCanceled == true) {
        callback?.onLayoutCancelled()
        return
      }

      callback?.onLayoutFinished(
        PrintDocumentInfo.Builder(file.name)
          .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
          .build(),
        true
      )
    }

    override fun onWrite(
      pages: Array<out PageRange>?,
      destination: ParcelFileDescriptor?,
      cancellationSignal: CancellationSignal?,
      callback: WriteResultCallback?
    ) {
      try {
        if (cancellationSignal?.isCanceled == true) {
          callback?.onWriteCancelled()
          return
        }

        if (destination == null) {
          callback?.onWriteFailed("The print system gave no destination.")
          return
        }

        ParcelFileDescriptor.AutoCloseOutputStream(destination).use { output ->
          file.inputStream().use { input -> input.copyTo(output, 64 * 1024) }
        }
        callback?.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
      } catch (error: Exception) {
        callback?.onWriteFailed(error.message)
      }
    }
  }
}
