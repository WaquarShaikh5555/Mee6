package expo.modules.pdfarena

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.tom_roush.pdfbox.pdmodel.PDDocument
import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Turning a URI into bytes and back again.
 *
 * The system picker hands over a `content://` URI, which is not a file and
 * cannot be handed to a renderer that wants random access. Everything that
 * needs a real file goes through [materialize], which copies into the app's
 * own cache once and drops it when the operation finishes.
 */
object PdfFiles {

  /** Where every result lives: app storage, not shared storage, no permission. */
  fun outputDir(context: Context): File {
    val dir = File(context.filesDir, "pdf-arena")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  fun cacheDir(context: Context): File {
    val dir = File(context.cacheDir, "pdf-arena")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  /** The display name the picker reported, or a last-resort "document". */
  fun displayName(context: Context, uri: Uri): String {
    if (uri.scheme == "file") return uri.lastPathSegment ?: "document.pdf"

    return try {
      context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { cursor ->
          if (cursor.moveToFirst() && !cursor.isNull(0)) cursor.getString(0) else null
        }
        ?: uri.lastPathSegment?.substringAfterLast('/')
        ?: "document"
    } catch (error: Exception) {
      uri.lastPathSegment ?: "document"
    }
  }

  private const val KEEP = 4
  private val materialized = LinkedHashMap<String, File>(8, 0.75f, true)

  /**
   * A real file for this URI.
   *
   * `file://` is used as-is. Anything else — a picker's `content://` URI — is
   * copied into the cache **once** and reused for every later operation on the
   * same URI. That matters most to the viewer, which renders one page per
   * request: copying a 40 MB document for each page would make swiping crawl.
   *
   * The known copies are kept in a small least-recently-used set and are the
   * cache's to delete, which is why the second value is false for them: the
   * caller must not free a file another operation may still be reading.
   */
  fun materialize(context: Context, uri: Uri): Pair<File, Boolean> {
    if (uri.scheme == "file") {
      val path = uri.path ?: throw IllegalArgumentException("A file link with no path")
      val file = File(path)
      if (!file.exists()) throw IllegalArgumentException("That file is no longer available")
      return file to false
    }

    val key = uri.toString()

    synchronized(materialized) {
      materialized[key]?.takeIf { it.exists() }?.let { return it to false }
    }

    val name = displayName(context, uri).replace(Regex("[^A-Za-z0-9._ -]"), "_")
    val target = File(cacheDir(context), "in-${System.nanoTime()}-$name")

    try {
      context.contentResolver.openInputStream(uri)?.use { input ->
        FileOutputStream(target).use { output -> input.copyTo(output, 64 * 1024) }
      } ?: throw IllegalArgumentException("That file could not be opened")
    } catch (error: Throwable) {
      deleteQuietly(target)
      throw error
    }

    synchronized(materialized) {
      materialized[key] = target
      val iterator = materialized.entries.iterator()
      while (materialized.size > KEEP && iterator.hasNext()) {
        val oldest = iterator.next()
        iterator.remove()
        deleteQuietly(oldest.value)
      }
    }

    return target to false
  }

  /** Drops copies left behind by an earlier run, once they are a day old. */
  fun pruneCache(context: Context) {
    val cutoff = System.currentTimeMillis() - 24 * 60 * 60 * 1000L

    try {
      cacheDir(context).listFiles()?.forEach { file ->
        if (file.isFile && file.lastModified() < cutoff) deleteQuietly(file)
      }
    } catch (error: Exception) {
      // The cache is the system's to reclaim; failing to tidy it is not an error.
    }
  }

  /** A unique file for a result, inside the output directory. */
  fun newOutput(context: Context, name: String): File {
    val safe = name.replace(Regex("[\\\\/:*?\"<>|]"), "-").ifBlank { "result" }
    var candidate = File(outputDir(context), safe)
    if (!candidate.exists()) return candidate

    val dot = safe.lastIndexOf('.')
    val stem = if (dot > 0) safe.substring(0, dot) else safe
    val extension = if (dot > 0) safe.substring(dot) else ""

    var index = 2
    while (candidate.exists()) {
      candidate = File(outputDir(context), "$stem ($index)$extension")
      index += 1
    }
    return candidate
  }

  /** Writes a PDF to disk and returns the file. */
  fun save(document: PDDocument, target: File): File {
    FileOutputStream(target).use { output ->
      document.save(output)
      output.flush()
    }
    return target
  }

  fun toUri(file: File): String = Uri.fromFile(file).toString()

  /**
   * A fresh folder for a tool that makes many files. Each run gets its own, so
   * two extractions of the same document never overwrite each other and
   * deleting one result cannot touch another.
   */
  fun newGallery(context: Context, name: String): File {
    val safe = name
      .replace(Regex("[\\\\/:*?\"<>|]"), "-")
      .trim()
      .ifBlank { "images" }

    var folder = File(outputDir(context), safe)
    var index = 2
    while (folder.exists()) {
      folder = File(outputDir(context), "$safe ($index)")
      index += 1
    }
    folder.mkdirs()
    return folder
  }

  /** A byte-for-byte copy, used when a result would be no better than the input. */
  fun copy(source: File, target: File): File {
    source.inputStream().use { input ->
      FileOutputStream(target).use { output -> input.copyTo(output, 64 * 1024) }
    }
    return target
  }

  /** Deletes a file, or a folder and everything inside it. */
  fun deleteTree(target: File?) {
    if (target == null || !target.exists()) return
    if (target.isDirectory) target.listFiles()?.forEach { deleteTree(it) }
    deleteQuietly(target)
  }

  fun sizeOf(file: File): Long = if (file.exists()) file.length() else 0L

  /** A ZIP of whatever entries the caller streams into it. */
  fun zip(target: File, write: (ZipOutputStream) -> Unit): File {
    ZipOutputStream(FileOutputStream(target).buffered()).use { zip ->
      write(zip)
      zip.finish()
    }
    return target
  }

  fun putEntry(zip: ZipOutputStream, name: String, body: (java.io.OutputStream) -> Unit) {
    zip.putNextEntry(ZipEntry(name))
    body(zip)
    zip.closeEntry()
  }

  fun deleteQuietly(file: File?) {
    try {
      file?.delete()
    } catch (error: Exception) {
      // Best effort: the cache is cleared by the system anyway.
    }
  }
}
