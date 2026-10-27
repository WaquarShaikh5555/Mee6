/**
 * Signatures, and where they go.
 *
 * A signature is one of two things: ink drawn with a finger, or a photograph of
 * a signature on paper. Both end up as the same payload the engine reads, so
 * the tools screens never have to care which.
 *
 * The drawing is kept as **strokes**, not as a picture of strokes: a few
 * kilobytes, sharp at any page size, and re-editable. A photo is kept as a file
 * the engine prepared — cropped to the ink, with the paper made transparent.
 *
 * Placement is a separate idea from the signature, because the same signature
 * can go on several pages at different spots. Fractions, always: a page is
 * whatever size it is, and the screen only knows what it showed.
 */

import { loadSignatures, prepareSignatureImage, saveSignature } from './engine';

export type Point = { x: number; y: number };
export type Stroke = Point[];

/** Ink colours a signature is allowed to be. Never a full colour picker. */
export const SIGNATURE_COLOURS: { value: string; label: string }[] = [
  { value: '#111111', label: 'Black ink' },
  { value: '#1D2A6B', label: 'Navy ink' },
  { value: '#0B5FA5', label: 'Blue ink' },
  { value: '#A31621', label: 'Red ink' },
];

export const DEFAULT_COLOUR = SIGNATURE_COLOURS[0]!.value;

/** Where the signature sits on one page. Fractions of the visible page. */
export type Placement = {
  /** One-based, as everywhere else in this feature. */
  page: number;
  /** Centre of the signature, across the page from the left. */
  x: number;
  /** Centre of the signature, down the page from the top. */
  y: number;
  /** Width as a fraction of the page's width. */
  w: number;
  /** Degrees clockwise. */
  rotation: number;
};

export type SignatureInk =
  | { kind: 'strokes'; strokes: Stroke[]; colour: string }
  /** `file` is the prepared PNG; `aspect` is height ÷ width, for the editor. */
  | { kind: 'photo'; file: string; aspect: number };

export type SignaturePayload = SignatureInk & { placements: Placement[] };

/** Four decimals is far below a screen pixel, and keeps the JSON small. */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/* ----------------------------------------------------------------- strokes --- */

export function signatureJson(strokes: Stroke[]): string {
  return JSON.stringify({
    strokes: strokes
      .filter((stroke) => stroke.length > 0)
      .map((stroke) => stroke.flatMap((point) => [round(point.x), round(point.y)])),
  });
}

export function parseSignature(json: string | null | undefined): Stroke[] {
  if (!json) return [];

  try {
    const parsed: unknown = JSON.parse(json);
    const raw =
      parsed && typeof parsed === 'object' && 'strokes' in parsed
        ? (parsed as { strokes?: unknown }).strokes
        : parsed;

    if (!Array.isArray(raw)) return [];

    return raw
      .map((stroke) => {
        if (!Array.isArray(stroke)) return [];
        const points: Stroke = [];
        for (let index = 0; index + 1 < stroke.length; index += 2) {
          const x: unknown = stroke[index];
          const y: unknown = stroke[index + 1];
          // `Number(null)` is 0, so a type check comes before the numbers.
          if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
            points.push({ x, y });
          }
        }
        return points;
      })
      .filter((stroke) => stroke.length > 0);
  } catch {
    return [];
  }
}

export function isEmptySignature(strokes: Stroke[]): boolean {
  return strokes.every((stroke) => stroke.length < 2);
}

/* ----------------------------------------------------------------- payload --- */

export function emptyPayload(ink: SignatureInk): SignaturePayload {
  return { ...ink, placements: [] };
}

export function payloadJson(payload: SignaturePayload | null): string {
  if (!payload) return '';

  if (payload.kind === 'photo') {
    return JSON.stringify({
      kind: 'photo',
      file: payload.file,
      aspect: round(payload.aspect),
      placements: payload.placements.map(clean),
    });
  }

  return JSON.stringify({
    kind: 'strokes',
    colour: payload.colour,
    strokes: payload.strokes
      .filter((stroke) => stroke.length > 0)
      .map((stroke) => stroke.flatMap((point) => [round(point.x), round(point.y)])),
    placements: payload.placements.map(clean),
  });
}

function clean(placement: Placement): Placement {
  return {
    page: Math.max(1, Math.round(placement.page)),
    x: round(clamp(placement.x, 0, 1)),
    y: round(clamp(placement.y, 0, 1)),
    w: round(clamp(placement.w, 0.05, 1)),
    rotation: Math.round(placement.rotation),
  };
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, value));
}

/** Reads back what the engine was given. Tolerant: rubbish is simply empty. */
export function parsePayload(json: string | null | undefined): SignaturePayload | null {
  if (!json) return null;

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const placements = Array.isArray(parsed.placements)
      ? (parsed.placements as Placement[])
          .filter((entry) => entry && typeof entry.page === 'number')
          .map(clean)
      : [];

    if (typeof parsed.file === 'string' && parsed.file.length > 0) {
      const aspect = typeof parsed.aspect === 'number' && parsed.aspect > 0 ? parsed.aspect : 0.4;
      return { kind: 'photo', file: parsed.file, aspect, placements };
    }

    const strokes = parseSignature(JSON.stringify({ strokes: parsed.strokes }));
    if (strokes.length === 0) return null;

    const colour = typeof parsed.colour === 'string' ? parsed.colour : DEFAULT_COLOUR;
    return { kind: 'strokes', strokes, colour, placements };
  } catch {
    return null;
  }
}

export function isSigned(payload: SignaturePayload | null): boolean {
  if (!payload || payload.placements.length === 0) return false;
  if (payload.kind === 'photo') return payload.file.length > 0;
  return !isEmptySignature(payload.strokes);
}

/** Something to put in front of a person: "ink, 2 spots on page 1, 3". */
export function describePayload(payload: SignaturePayload | null): string {
  if (!payload) return 'No signature yet';

  const pages = [...new Set(payload.placements.map((placement) => placement.page))].sort(
    (a, b) => a - b,
  );

  if (pages.length === 0) return 'Signature ready — not placed yet';
  if (pages.length === 1) return `On page ${pages[0]}`;
  if (pages.length <= 4) return `On pages ${pages.join(', ')}`;
  return `On ${pages.length} pages`;
}

/* ------------------------------------------------------------ a photograph --- */

export type PreparedPhoto = { uri: string; width: number; height: number };

/**
 * Hands a picked photo to the engine, which crops it to the ink and drops the
 * paper. Doing it natively matters: the trimming is a per-pixel decision on a
 * twelve-megapixel image.
 */
export async function preparePhoto(uri: string): Promise<PreparedPhoto | null> {
  try {
    return await prepareSignatureImage(uri);
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- the library --- */

export type SavedSignature = { uri: string; createdAt: number };

export async function loadSavedSignatures(): Promise<SavedSignature[]> {
  try {
    const saved = await loadSignatures();
    return saved.filter((entry) => typeof entry.uri === 'string');
  } catch {
    return [];
  }
}

export async function rememberSignature(payload: SignaturePayload): Promise<boolean> {
  try {
    await saveSignature(payloadJson(payload));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------- the preview --- */

/** An SVG path through the points, smoothed with quadratic midpoints. */
export function strokePath(stroke: Stroke, scaleX: number, scaleY: number): string {
  if (stroke.length === 0) return '';

  const points = stroke.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }));
  const first = points[0]!;

  if (points.length === 1) return `M ${first.x} ${first.y} L ${first.x + 0.1} ${first.y}`;

  let path = `M ${first.x} ${first.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index]!;
    const next = points[index + 1]!;
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
  }

  const last = points[points.length - 1]!;
  const beforeLast = points[points.length - 2]!;
  path += ` Q ${beforeLast.x} ${beforeLast.y} ${last.x} ${last.y}`;
  return path;
}

/** The ink's own bounding box, in the same fractions the points use. */
export function inkBounds(strokes: Stroke[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    for (const point of stroke) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 1, h: 0.4 };

  const pad = Math.max(0.004, (maxX - minX) * 0.03);
  return {
    x: minX - pad,
    y: minY - pad,
    w: Math.max(0.01, maxX - minX + pad * 2),
    h: Math.max(0.01, maxY - minY + pad * 2),
  };
}
