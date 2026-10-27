/**
 * The PDF engine, as the app sees it.
 *
 * Every operation happens in Kotlin, on the phone, with PdfBox-Android and
 * Android's own renderer. Nothing here loads a document into JavaScript: a file
 * is a URI in and a URI out, so a 60 MB PDF never becomes a base64 string in
 * the JS heap.
 *
 * `requireOptionalNativeModule` means the same bundle still runs in the web
 * preview and in Expo Go, where the engine is absent and the feature says so
 * instead of crashing.
 */

export type PdfProbe = {
  pages: number;
  /** The file is encrypted, with or without a password we can supply. */
  encrypted: boolean;
  /** The file needs a password before anything can be read. */
  needsPassword: boolean;
  sizeBytes: number;
  title: string;
  author: string;
};

export type PdfResult = {
  outputUri: string;
  outputName: string;
  sizeBytes: number;
  pages: number;
  /** A sentence for the success card: "12 pages, 3 images re-encoded". */
  summary: string;
  warnings: string[];
  /**
   * Every file this run made. One for most tools; one per page for "to images"
   * and one per picture for "extract images", so the screen can show them
   * instead of hiding them in an archive.
   */
  outputUris: string[];
  /** The words, for a text extraction, so they can be read without a file. */
  text: string | null;
};

export type RenderedPage = {
  /** base64 PNG, ready for an <Image source={{ uri: 'data:image/png;base64,…' }} />. */
  data: string;
  width: number;
  height: number;
};

export type TextMatch = {
  /** 0-based. */
  page: number;
  snippet: string;
  /** Boxes to outline, as fractions of the page (0–1, from the top left). */
  rects?: { x: number; y: number; w: number; h: number }[];
};

export type PageDifference = {
  page: number;
  /** 0 = identical, 1 = nothing in common. */
  changed: number;
};

export type CompareReport = {
  pagesA: number;
  pagesB: number;
  differences: PageDifference[];
};

export type Bookmark = { title: string; page: number };

export type ProcessRequest = {
  toolId: string;
  inputUris: string[];
  /** The password to open the input with, when it needs one. */
  password?: string;
  /** Every option value, as strings — the catalog decides what they mean. */
  options: Record<string, string>;
  /** Base name for the output, without a path or extension. */
  outputName: string;
};

type PdfArenaNativeModule = {
  probe(uri: string, password?: string | null): Promise<PdfProbe>;
  process(request: ProcessRequest): Promise<PdfResult>;
  renderPage(
    uri: string,
    page: number,
    maxWidth: number,
    password?: string | null,
  ): Promise<RenderedPage>;
  findText(uri: string, query: string, password?: string | null): Promise<TextMatch[]>;
  readBookmarks(uri: string, password?: string | null): Promise<Bookmark[]>;
  compare(
    firstUri: string,
    secondUri: string,
    firstPassword?: string | null,
    secondPassword?: string | null,
  ): Promise<CompareReport>;
  print(uri: string, jobName: string, password?: string | null): Promise<void>;
  /** Crops a photo of a signature to its ink and drops the paper. */
  prepareSignatureImage(uri: string): Promise<{ uri: string; width: number; height: number }>;
  /** Keeps a signature on this phone; `payloadJson` is what the editor built. */
  saveSignature(payloadJson: string): Promise<{ uri: string; createdAt: number }>;
  loadSignatures(): Promise<{ uri: string; createdAt: number }[]>;
  deleteSignature(uri: string): Promise<boolean>;
  /** Writes results into the phone's Downloads folder; returns where they went. */
  saveToDownloads(
    uris: string[],
    name: string,
    folder?: string | null,
  ): Promise<{ saved: number; where: string }>;
  deleteOutput(uri: string): Promise<void>;
};

function nativeModule(): PdfArenaNativeModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-modules-core').requireOptionalNativeModule?.('PdfArena');
    return (mod as PdfArenaNativeModule | null) ?? null;
  } catch {
    return null;
  }
}

/** False in the web preview and in Expo Go; the UI explains rather than fails. */
export function isEngineAvailable(): boolean {
  return nativeModule() !== null;
}

function requireEngine(): PdfArenaNativeModule {
  const engine = nativeModule();
  if (!engine) {
    throw new PdfError(
      'unavailable',
      'PDF Arena needs the installed app. The preview cannot process files on your phone.',
    );
  }
  return engine;
}

export type PdfErrorCode =
  | 'unavailable'
  | 'password'
  | 'corrupt'
  | 'range'
  | 'unsupported'
  | 'no-space'
  | 'unknown';

export class PdfError extends Error {
  readonly code: PdfErrorCode;

  constructor(code: PdfErrorCode, message: string) {
    super(message);
    this.name = 'PdfError';
    this.code = code;
  }
}

/**
 * Native exceptions arrive as strings. Turning the ones we know into typed
 * errors lets the UI offer the right next step: a password prompt, a clearer
 * page range, or an honest "this file is damaged".
 */
function toPdfError(error: unknown): PdfError {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();

  // The engine prefixes the failures it knows about, so the exact kind survives
  // even when the wording changes. The substring checks below are the fallback
  // for platform errors that arrive without one.
  const prefixed = /^(password|corrupt|page|unsupported):\s*(.*)$/i.exec(message);
  if (prefixed) {
    const detail = prefixed[2] || message;
    switch (prefixed[1]!.toLowerCase()) {
      case 'password':
        return new PdfError('password', 'That password does not open this document.');
      case 'corrupt':
        return new PdfError('corrupt', detail || 'This file could not be read as a PDF.');
      case 'page':
        return new PdfError('range', detail || 'That page does not exist in this document.');
      case 'unsupported':
        return new PdfError('unsupported', detail || 'The engine cannot do that with this file.');
    }
  }

  if (lower.includes('password')) {
    return new PdfError('password', 'That password does not open this document.');
  }
  if (lower.includes('no space') || lower.includes('enospc')) {
    return new PdfError('no-space', 'There is not enough free space to write the result.');
  }
  if (lower.includes('encrypted')) {
    return new PdfError('password', 'This document is password protected.');
  }
  if (lower.includes('corrupt') || lower.includes('invalid') || lower.includes('cannot read')) {
    return new PdfError('corrupt', 'This file could not be read as a PDF. Repair may help.');
  }
  if (lower.includes('page')) {
    return new PdfError('range', message || 'That page does not exist in this document.');
  }
  if (lower.includes('unsupported')) {
    return new PdfError('unsupported', 'This document uses something the engine cannot do.');
  }

  return new PdfError('unknown', message || 'Something went wrong while processing the file.');
}

async function guard<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof PdfError) throw error;
    throw toPdfError(error);
  }
}

/* ------------------------------------------------------------------ api --- */

export function probe(uri: string, password?: string): Promise<PdfProbe> {
  return guard(() => requireEngine().probe(uri, password ?? null));
}

export async function process(request: ProcessRequest): Promise<PdfResult> {
  return guard(async () => {
    const result = await requireEngine().process(request);

    // Older engines sent one file and nothing else; normalising here means the
    // screens never have to ask which shape they are holding.
    return {
      ...result,
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
      outputUris:
        Array.isArray(result.outputUris) && result.outputUris.length > 0
          ? result.outputUris
          : [result.outputUri],
      text: typeof result.text === 'string' ? result.text : null,
    };
  });
}

export function renderPage(
  uri: string,
  page: number,
  maxWidth: number,
  password?: string,
): Promise<RenderedPage> {
  return guard(() => requireEngine().renderPage(uri, page, maxWidth, password ?? null));
}

export function findText(uri: string, query: string, password?: string): Promise<TextMatch[]> {
  return guard(() => requireEngine().findText(uri, query, password ?? null));
}

export function readBookmarks(uri: string, password?: string): Promise<Bookmark[]> {
  return guard(() => requireEngine().readBookmarks(uri, password ?? null));
}

export function compare(
  firstUri: string,
  secondUri: string,
  firstPassword?: string,
  secondPassword?: string,
): Promise<CompareReport> {
  return guard(() =>
    requireEngine().compare(firstUri, secondUri, firstPassword ?? null, secondPassword ?? null),
  );
}

export function print(uri: string, jobName: string, password?: string): Promise<void> {
  return guard(() => requireEngine().print(uri, jobName, password ?? null));
}

export function prepareSignatureImage(
  uri: string,
): Promise<{ uri: string; width: number; height: number }> {
  return guard(() => requireEngine().prepareSignatureImage(uri));
}

export function saveSignature(
  payloadJson: string,
): Promise<{ uri: string; createdAt: number }> {
  return guard(() => requireEngine().saveSignature(payloadJson));
}

export function loadSignatures(): Promise<{ uri: string; createdAt: number }[]> {
  return guard(() => requireEngine().loadSignatures());
}

export function deleteSignature(uri: string): Promise<boolean> {
  return guard(() => requireEngine().deleteSignature(uri));
}

/**
 * Copies results into the phone's Downloads folder.
 *
 * The files this feature makes live in app storage, which no file manager
 * shows — fine for working, useless for keeping. This is the "it is now a file
 * on my phone" step, and it needs no permission on Android 10 or later.
 */
export function saveToDownloads(
  uris: string[],
  name: string,
  folder?: string,
): Promise<{ saved: number; where: string }> {
  return guard(() => requireEngine().saveToDownloads(uris, name, folder ?? null));
}

export function deleteOutput(uri: string): Promise<void> {
  return guard(() => requireEngine().deleteOutput(uri));
}
