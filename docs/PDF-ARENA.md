# PDF Arena

Every tool PaperKnife+ ships, rebuilt inside Shaikh's, with one engine and one
consistent interface.

## Why it is a rebuild, not a port

PaperKnife+ is GPL-3.0. Copying its source into Shaikh's would make Shaikh's GPL-3.0 as
well — every future feature, forever. So this is an independent implementation of the same
feature set, written against the same third-party PDF library PaperKnife+ uses
([PdfBox-Android](https://github.com/TomRoush/PdfBox-Android), Apache-2.0), which is
permissive and can be used freely. Features are not copyrightable; their code is.

What that means in practice: the file layout, the code, the naming, and the UI here are
all original. Nothing was copied.

## Feature parity

| # | PaperKnife+ | PDF Arena | How it works |
| --- | --- | --- | --- |
| 1 | Merge | **Merge** | Copy pages from several documents into one, in the order chosen |
| 2 | Split | **Split** | Page range → one PDF, or one PDF per page in a ZIP |
| 3 | Delete | **Delete pages** | Range → the same document without those pages |
| 4 | Rearrange | **Rearrange** | Tap pages in the new order; a numbered list builds up |
| 5 | Rotate | **Rotate** | Arrows either side of the page turn it a quarter at a time, both ways, previewed live |
| 6 | Sign | **Sign** | Draw in four inks or use a photo, then drag and pinch it into place on any page |
| 7 | Watermark | **Watermark** | Text, opacity, angle, size, range |
| 8 | Page numbers | **Page numbers** | `{n}` format, six positions, start number, size |
| 9 | Bookmarks | **Bookmarks** | Read the outline, add and remove entries |
| 10 | Compress | **Compress** | Re-encode embedded images only; if that cannot beat the original, the original comes back unchanged |
| 11 | Grayscale | **Grayscale** | Flatten pages to B&W at 1.2× and re-emit |
| 12 | Repair | **Repair** | Lenient parse, then a clean rewrite |
| 13 | Compare | **Compare** | Render both, report which pages differ and by how much |
| 14 | Lock | **Protect** | AES-128 password, owner password set too |
| 15 | Unlock | **Unlock** | Open with password, strip security |
| 16 | Metadata | **Metadata** | Title, author, subject, keywords |
| 17 | PDF to Image | **To images** | Native renderer at 1×–3×; one PNG/JPEG/WebP per page, shown in a gallery |
| 18 | Image to PDF | **From images** | Each image a page, fit or A4 |
| 19 | PDF to ZIP | **To ZIP** | One single-page PDF per page, zipped |
| 20 | Extract images | **Extract images** | Original image objects pulled out at full size, one file each, inherited resources included |
| 21 | PDF to Text | **To text** | Text layer in any script, shown in the app and copied to a UTF-8 `.txt` |
| — | Viewer | **Viewer** | Paged viewer, find with highlights, print, share; opened from any file card |
| — | History | **Result card** | Gallery of what was made, each picture openable and shareable |
| — | Settings | **None yet** | Deliberately absent: nothing in this feature needs configuring |

Two deliberate differences:

- **Passwords are never guessed.** A locked PDF asks once, and the password stays in memory
  for that file only.
- **Nothing leaves the phone.** No account, no upload, no network call in this feature at
  all — same promise as the original.

## What the first release taught us

Three things were wrong in 0.5.0, and each was a design mistake rather than a bug:

- **A file card with no picture is not a preview.** Every chosen document now shows page 1,
  rendered by the engine, with **Preview** opening the viewer on that file. The rotate control
  shows the same page turned by the angle you picked, before anything is written.
- **An archive is not a result.** "To images" and "Extract images" used to hand back a ZIP —
  technically correct, useless on a phone. Both now write one file per picture, returned as a
  list, displayed as a gallery with a full-screen look and a share for each.
- **Settings below the fold are settings nobody saw.** The rotate angle was on the screen but
  under the file card, so tapping the button looked like the app choosing 90° for you. Every
  tool now states its settings in a line directly above the button — "90° right · all pages" —
  and the run button is always in view.
- **A text extractor that only writes `.txt` is a file, not an extractor.** The words now come
  back with the result: readable in the card, selectable, copyable, with the `.txt` still there
  to share.

Two engine fixes came with them. Embedded resources are frequently **inherited from an
ancestor page node** rather than stored on the page; extraction read only the page and found
nothing on exactly the documents people care about. And compression could hand back a file
that was the *same size or larger* while calling it compressed — it now measures, and returns
the original unchanged with a plain explanation when the work does not pay off.

## Other languages

Two things decide whether a Hindi, Arabic or Chinese document comes out readable, and both
were wrong at first:

- **The read itself.** A layout-aware text stripper throws — or returns nothing — when a font
  carries no Unicode map, which is routine in CJK, Arabic and Indic files. Each page is now
  read twice: laid out first, and if that yields nothing, straight from the glyph stream
  (`processTextPosition`), which skips the layout engine entirely. A page that defeats both is
  named in the result rather than silently dropped.
- **The file's encoding.** The `.txt` is written as UTF-8 **with a byte order mark**. Without
  it, Windows editors and several Android viewers fall back to a single-byte code page and
  render Devanagari, Arabic or Han as mojibake — perfect text, unreadable file.

Text is normalised to NFC (so an accented Latin letter stops arriving as two code points),
control characters and soft hyphens are dropped, nothing else is touched. The word count
switches to characters when the script does not separate words with spaces, because a Chinese
page otherwise reports "1 word".

## Architecture

```
src/pdf/
  catalog.ts    21 tools, their options, their output naming — the single source of truth
  components/   PageThumb (a page as a picture), gallery results, signature pad, controls
  ranges.ts     "1-3, 7, 9-" → page indices, with the errors a person can act on
  engine.ts     the TypeScript face of the native module
  format.ts     bytes, durations, sizes
  documents.ts  the two system pickers, normalised to one `PickedFile`
  useDocument.ts  probe, page count, password prompt — one hook per document
  useToolRun.ts   run a tool, track it, hand the result to the share sheet
  signature.ts    signatures as strokes: JSON in, SVG path out
src/app/(app)/pdf/
  index.tsx     the Arena: search, categories, tool grid
  [toolId].tsx  one screen, driven by the catalog — 21 tools, one implementation
  viewer.tsx    paged viewer, find-with-highlights, print, share
src/pdf/components/
  ToolTile.tsx     one tile in the grid
  FileCard.tsx     the document slot: empty, filled, or asking for a password
  ToolControls.tsx every option kind: range, choice, text, number, slider,
                   toggle, page order, bookmarks, signature pad, note
  SignaturePad.tsx the pad itself, drawn with vectors
  ResultCard.tsx   what happened, and what to do with it
  ComparePanel.tsx the one tool whose result is a report, not a file
modules/pdf/    the engine (Kotlin): PdfBox-Android + Android's own renderer
```

### The interface, and why it looks like this

The original is a list of Compose screens, each with its own layout. This version has three
screens and one rule: **a tool is a row in a table, not a screen**. The Arena is a grid of
tiles that filters as you type; a tool screen is a file slot, its options, and one button.

- **A pinned action.** The button that does the work sits above the safe area, always
  reachable, never scrolled away. When it cannot run it says why in one sentence — "Choose a
  document to begin", "That page range does not exist" — rather than being mysteriously grey.
- **The result replaces the form.** When a tool finishes, the form is gone and the summary,
  the file name, its size, the saving and the time taken are in its place, with Share and
  Open. Done returns to the form with the same file still chosen.
- **Nothing is a dead end.** A damaged file offers Repair; a wrong password is a prompt, not
  an error screen; a search with no results suggests plainer words.
- **One accent.** Icons are the only colour on a tile; the rest is type, spacing and a
  hairline. Every control is a real touch target (44/48 pt), and every control reads its
  colours from the theme, so light and dark are the same design.

### Signing: a pad, then the page

The original put a signature pad on the tool screen and a row of corner buttons beside it. That
is a form, not a signature: you cannot see where the ink lands, and "bottom right" is not a
decision anyone makes about a contract.

Two screens instead, each doing one thing:

1. **The pad**, full screen — ink in black, navy, blue or red; undo and clear; and a photo
   option for a signature that already exists on paper. A photo is not pasted in as it is: the
   engine crops to the ink and fades the paper to transparent, so what lands on the page is
   handwriting rather than a white rectangle.
2. **The page**, with the signature on it — drag to move, pinch to size, twist to tilt, and a
   page strip so the same signature can go on page 1 and page 7 at different spots. It sits in
   a dashed frame with corner marks: a signature is thin ink, and something has to show where to
   put a finger and prove the ink is really there.

The preview draws the strokes in the ink's **own units**, with a weight proportional to its
width. It must never use `vectorEffect="non-scaling-stroke"`: that redefines the stroke width as
screen *pixels*, so a number that reads like a fraction of the ink becomes a line a thousandth
of a pixel wide. That is precisely how 0.8.0 shipped a signature pad that drew fine and a page
that stayed blank; `__tests__/pdfSignPlacement.test.tsx` now asserts the weight is drawable, not
merely present.

The engine receives fractions of the *visible* page — 0–1 across, 0–1 down — plus a rotation.
A PDF page is bottom-left origin and may carry its own `/Rotate`, so one function,
`PdfSignatures.toUserSpace`, is the only place that difference is allowed to exist; everything
a person sees is in screen coordinates, top-left.

Drawn ink is kept as **strokes** (the path of the finger, normalised to the pad's width), so it
is a few kilobytes, stays sharp at any size, and can be redrawn in the pad next time. A photo
is kept as a prepared PNG. Both are saved to a small on-phone library, newest first, so the
second signature of the day is one tap.

**One screen, 21 tools.** A tool is data: what it needs, which options it takes, how its
output is named. Adding the 22nd tool means adding an entry, not a screen.

### Where results live

Everything is *written* to app storage: no permission, no half-finished file in a shared folder,
and deleting a result can never touch the person's own documents.

Everything is *kept* in `Download/Shaikh's/`, through the system Downloads collection on Android
10 and later — no permission needed, and the file shows up in Files, in Downloads, and in every
other app's share sheet. A tool that made many files (pages to images, extracted pictures) puts
them in one folder named after the document instead of forty loose files.

The result card leads with **Save to my phone** and confirms the path it used, because "where is
it?" is the first question after "did it work", and a share sheet is not an answer to it.

### Why the engine is native

Rotating a PDF, extracting its text, and encrypting it are not things a JavaScript bundle
should attempt. PdfBox-Android is a full PDF implementation — object model, filters,
encryption, text extraction, content streams — and Android ships a hardware-accelerated
renderer for the rasterising parts. Both run on the phone.

### The boundary

The app never loads a PDF into JavaScript. It passes a URI to the engine and gets back a
result; a 60 MB file never becomes a 80 MB base64 string in the JS heap. Rendering for the
viewer is the only data that crosses back, and only one page at a time.

## Rules of the road

- **Fail loudly, in the person's words.** "That page range doesn't exist" beats "IOException".
- **Never overwrite the input.** Outputs are new files in `pdf-arena/` inside app storage.
- **Keep the original's metadata** unless the Metadata tool is the one running.
- **A locked file is one prompt, not a maze.** Ask once, remember for the session.
- **No network code in this feature.** Enforced by review: the module imports nothing that
  can reach the internet.
