/**
 * Page ranges, the way a person writes them: "1-3, 7, 9-", "all", or "4".
 *
 * A PDF's pages are 1-based to a reader and 0-based to the engine. Every bug in
 * this area is an off-by-one that silently drops or duplicates a page, so the
 * conversion happens here once and every tool uses it.
 */

export type PageRange = {
  /** Inclusive, 1-based, in the order written. Empty means "no pages". */
  pages: number[];
  /** True when the text covered every page, so callers can skip work. */
  everything: boolean;
};

export type RangeError =
  | { kind: 'empty' }
  | { kind: 'not-a-range' }
  | { kind: 'out-of-bounds'; page: number; pageCount: number }
  | { kind: 'backwards'; from: number; to: number };

export type RangeResult = { ok: true; range: PageRange } | { ok: false; error: RangeError };

// "-4" (from the start) is legal, which is why the leading dash is allowed.
const NUMBERS = /^-?\d+(-\d*)?$/;

/**
 * Parses a range against a document of `pageCount` pages.
 *
 * Accepts: `all`, `1-3`, `7`, `9-`, `-4`, and any comma/space separated mix.
 * Duplicates are dropped while keeping the first occurrence, so "3, 1-2, 3"
 * yields [3, 1, 2] — order matters to Rearrange and not to the others.
 */
export function parseRange(input: string, pageCount: number): RangeResult {
  const text = input.trim().toLowerCase();
  if (text.length === 0) return { ok: false, error: { kind: 'empty' } };

  if (text === 'all' || text === '*') {
    return { ok: true, range: { pages: allPages(pageCount), everything: true } };
  }

  const seen = new Set<number>();
  const pages: number[] = [];

  const push = (page: number) => {
    if (page < 1 || page > pageCount) return false;
    if (seen.has(page)) return true;
    seen.add(page);
    pages.push(page);
    return true;
  };

  for (const rawPart of text.split(',')) {
    const part = rawPart.trim().replace(/\s+/g, '');
    if (part.length === 0) continue;
    if (!NUMBERS.test(part)) return { ok: false, error: { kind: 'not-a-range' } };

    const [fromText, toText] = part.split('-');
    const from = Number(fromText);

    // "7" — a single page.
    if (toText === undefined) {
      if (!push(from)) return outOfBounds(from, pageCount);
      continue;
    }

    // "9-" — to the end. "-4" has an empty `from`, which is page 1.
    const start = fromText.length === 0 ? 1 : from;
    const end = toText.length === 0 ? pageCount : Number(toText);

    if (start > end) return { ok: false, error: { kind: 'backwards', from: start, to: end } };
    if (start < 1) return outOfBounds(start, pageCount);
    if (end > pageCount) return outOfBounds(end, pageCount);

    for (let page = start; page <= end; page += 1) push(page);
  }

  if (pages.length === 0) return { ok: false, error: { kind: 'empty' } };

  return {
    ok: true,
    range: { pages, everything: pages.length === pageCount && everyPage(pages, pageCount) },
  };
}

function everyPage(pages: number[], pageCount: number): boolean {
  if (pages.length !== pageCount) return false;
  for (let index = 0; index < pageCount; index += 1) {
    if (pages[index] !== index + 1) return false;
  }
  return true;
}

function outOfBounds(page: number, pageCount: number): RangeResult {
  return { ok: false, error: { kind: 'out-of-bounds', page, pageCount } };
}

export function allPages(pageCount: number): number[] {
  return Array.from({ length: Math.max(0, pageCount) }, (_, index) => index + 1);
}

/** The complement of `pages`, in document order. Used by Delete. */
export function invert(pages: number[], pageCount: number): number[] {
  const keep = new Set(pages);
  return allPages(pageCount).filter((page) => !keep.has(page));
}

/** A sentence a person can act on. */
export function describeRangeError(error: RangeError): string {
  switch (error.kind) {
    case 'empty':
      return 'Enter the pages you want, like 1-3 or 7.';
    case 'not-a-range':
      return 'Use numbers and dashes only — for example 1-3, 7.';
    case 'out-of-bounds':
      return `This document has ${error.pageCount} ${error.pageCount === 1 ? 'page' : 'pages'}, so page ${error.page} does not exist.`;
    case 'backwards':
      return `${error.from} comes after ${error.to}. Write the range the other way round.`;
  }
}

/** "1-3, 7, 9-" for a list of pages — the inverse of the parser, for display. */
export function formatPages(pages: number[]): string {
  if (pages.length === 0) return 'none';

  const sorted = [...pages].sort((a, b) => a - b);
  const spans: string[] = [];
  let start = sorted[0]!;
  let previous = start;

  for (const page of sorted.slice(1)) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    spans.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = page;
    previous = page;
  }
  spans.push(start === previous ? `${start}` : `${start}-${previous}`);

  return spans.join(', ');
}
