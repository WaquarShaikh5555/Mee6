package expo.modules.pdfarena

import android.content.Context
import com.tom_roush.pdfbox.pdmodel.encryption.AccessPermission
import com.tom_roush.pdfbox.pdmodel.encryption.StandardProtectionPolicy

/**
 * Locking, unlocking, and describing.
 *
 * The password rule is the same everywhere: it is never stored, never logged,
 * and never written anywhere but into the encrypted file itself.
 */
object PdfSecure {

  /** AES-128, the strongest the engine offers, with owner and user set alike. */
  fun protect(context: Context, request: PdfRequest): PdfOutcome {
    val password = request.option("password")

    if (password.length < 4) {
      throw PdfOpen.PdfFailure(
        "Choose a password of at least 4 characters.",
        PdfOpen.PdfFailure.Kind.OTHER,
      )
    }

    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { document, _ ->
      // Reading and printing stay allowed; changing the document does not.
      // Anything stricter would make the file useless to the person who asked
      // for it, and anything looser would make "locked" a decoration.
      // Method calls rather than properties: `AccessPermission` names its
      // getters `isCanPrint` and the like, which Kotlin does not map to a
      // `canPrint` property.
      val permissions = AccessPermission()
      permissions.setCanPrint(true)
      permissions.setCanPrintDegraded(true)
      permissions.setCanExtractForAccessibility(true)
      permissions.setCanModify(false)
      permissions.setCanModifyAnnotations(false)
      permissions.setCanFillInForm(false)
      permissions.setCanExtractContent(false)
      permissions.setCanAssembleDocument(false)

      val policy = StandardProtectionPolicy(password, password, permissions)
      // Method calls, not properties: the defaults are RC4 and 40 bits, which
      // would make "locked" a much weaker promise than the screen makes.
      policy.setEncryptionKeyLength(128)
      policy.setPreferAES(true)

      document.protect(policy)
      PdfEngine.stamp(document)

      val output = PdfFiles.save(document, PdfEngine.output(context, request))
      PdfEngine.outcome(
        output,
        document.numberOfPages,
        "Locked with a password — keep it somewhere safe",
        listOf("There is no way to open this file again without that password."),
      )
    }
  }

  fun unlock(context: Context, request: PdfRequest): PdfOutcome {
    val password = request.option("password")

    return PdfOpen.withInput(context, request.inputUris.first(), password) { document, _ ->
      if (!document.isEncrypted) {
        throw PdfOpen.PdfFailure(
          "This document is not locked, so there is nothing to remove.",
          PdfOpen.PdfFailure.Kind.OTHER,
        )
      }

      document.isAllSecurityToBeRemoved = true
      PdfEngine.stamp(document)

      val output = PdfFiles.save(document, PdfEngine.output(context, request))
      PdfEngine.outcome(output, document.numberOfPages, "Password removed")
    }
  }

  fun metadata(context: Context, request: PdfRequest): PdfOutcome {
    return PdfOpen.withInput(context, request.inputUris.first(), request.password) { document, _ ->
      val info = document.documentInformation

      // An empty field is removed rather than set to "", which is what a reader
      // shows as a blank line in its properties panel.
      info.title = request.option("title").ifEmpty { null }
      info.author = request.option("author").ifEmpty { null }
      info.subject = request.option("subject").ifEmpty { null }
      info.keywords = request.option("keywords").ifEmpty { null }
      if (info.creator.isNullOrBlank()) info.creator = "Shaikh's PDF Arena"
      if (info.producer.isNullOrBlank()) info.producer = "Shaikh's PDF Arena"

      val output = PdfFiles.save(document, PdfEngine.output(context, request))
      val changed = listOf("title", "author", "subject", "keywords")
        .count { request.option(it).isNotEmpty() }

      PdfEngine.outcome(
        output,
        document.numberOfPages,
        if (changed == 0) "Metadata cleared" else "$changed fields written",
      )
    }
  }
}
