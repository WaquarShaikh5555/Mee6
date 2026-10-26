/**
 * Signatures, as strokes.
 *
 * A signature is kept as the lines that made it, not as a picture: a few
 * kilobytes, sharp on any page size, and redrawable in the pad next time. Both
 * axes are fractions of the pad's **width**, so the proportions of the
 * handwriting survive a different-sized pad on a different phone.
 */

import { loadSignature, saveSignature } from './engine';

export type Point = { x: number; y: number };
export type Stroke = Point[];

/** Four decimals is far below a screen pixel, and keeps the JSON small. */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

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

/** The saved signature for this phone, or an empty pad. */
export async function loadSavedSignature(): Promise<Stroke[]> {
  try {
    return parseSignature(await loadSignature());
  } catch {
    return [];
  }
}

export async function rememberSignature(strokes: Stroke[]): Promise<boolean> {
  try {
    await saveSignature(signatureJson(strokes));
    return true;
  } catch {
    return false;
  }
}

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
