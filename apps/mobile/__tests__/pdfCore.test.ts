/**
 * PDF Arena's decisions, before any PDF is involved.
 *
 * The page range parser is where an off-by-one turns into a silently deleted
 * page, so it gets the most attention. The catalog tests guard the one promise
 * the UI makes: every tool has a name, a category and something to control.
 */

import {
  CATEGORIES,
  PDF_TOOLS,
  defaultsFor,
  findTool,
  searchTools,
  summariseOptions,
  toolsIn,
  type PdfTool,
} from '@/pdf/catalog';
import { formatBytes, formatDuration, formatSaving, outputNameFor } from '@/pdf/format';
import { allPages, describeRangeError, formatPages, invert, parseRange } from '@/pdf/ranges';

const ok = (input: string, count: number) => {
  const result = parseRange(input, count);
  if (!result.ok) throw new Error(`expected ${input} to parse`);
  return result.range;
};

const fail = (input: string, count: number) => {
  const result = parseRange(input, count);
  if (result.ok) throw new Error(`expected ${input} to fail`);
  return result.error;
};

describe('page ranges', () => {
  it('reads a single page', () => {
    expect(ok('7', 10).pages).toEqual([7]);
  });

  it('reads a closed range', () => {
    expect(ok('2-4', 10).pages).toEqual([2, 3, 4]);
  });

  it('reads an open range to the end', () => {
    expect(ok('8-', 10).pages).toEqual([8, 9, 10]);
  });

  it('reads an open range from the start', () => {
    expect(ok('-3', 10).pages).toEqual([1, 2, 3]);
  });

  it('reads a mix, keeping the order written', () => {
    expect(ok('5, 1-2, 9', 10).pages).toEqual([5, 1, 2, 9]);
  });

  it('drops duplicates but keeps the first position', () => {
    expect(ok('3, 1-2, 3', 4).pages).toEqual([3, 1, 2]);
  });

  it('treats "all" and "*" as every page', () => {
    expect(ok('all', 3)).toEqual({ pages: [1, 2, 3], everything: true });
    expect(ok('*', 2)).toEqual({ pages: [1, 2], everything: true });
    expect(ok('ALL', 2).everything).toBe(true);
  });

  it('knows when a written-out range also covers everything', () => {
    expect(ok('1-3', 3).everything).toBe(true);
    expect(ok('1-2', 3).everything).toBe(false);
  });

  it('is not thrown by stray spaces', () => {
    expect(ok(' 2 - 4 , 7 ', 10).pages).toEqual([2, 3, 4, 7]);
  });

  it('rejects nonsense with a reason', () => {
    expect(fail('', 10).kind).toBe('empty');
    expect(fail('   ', 10).kind).toBe('empty');
    expect(fail('abc', 10).kind).toBe('not-a-range');
    expect(fail('1..3', 10).kind).toBe('not-a-range');
    expect(fail('1;2', 10).kind).toBe('not-a-range');
  });

  it('rejects pages the document does not have', () => {
    expect(fail('12', 10)).toEqual({ kind: 'out-of-bounds', page: 12, pageCount: 10 });
    expect(fail('8-12', 10)).toEqual({ kind: 'out-of-bounds', page: 12, pageCount: 10 });
    expect(fail('0', 10).kind).toBe('out-of-bounds');
  });

  it('rejects a backwards range', () => {
    expect(fail('5-2', 10)).toEqual({ kind: 'backwards', from: 5, to: 2 });
  });

  it('says something a person can act on', () => {
    expect(describeRangeError({ kind: 'out-of-bounds', page: 12, pageCount: 10 })).toContain(
      '10 pages',
    );
    expect(describeRangeError({ kind: 'backwards', from: 5, to: 2 })).toContain('other way round');
    expect(describeRangeError({ kind: 'not-a-range' })).toContain('1-3');
  });
});

describe('range helpers', () => {
  it('inverts a selection', () => {
    expect(invert([2, 4], 5)).toEqual([1, 3, 5]);
    expect(invert(allPages(3), 3)).toEqual([]);
  });

  it('writes ranges back out', () => {
    expect(formatPages([1, 2, 3, 7, 9, 10])).toBe('1-3, 7, 9-10');
    expect(formatPages([4])).toBe('4');
    expect(formatPages([])).toBe('none');
  });

  it('round-trips', () => {
    const pages = [1, 2, 3, 8, 9];
    expect(ok(formatPages(pages), 10).pages).toEqual(pages);
  });
});

describe('the tool catalog', () => {
  it('covers every tool PaperKnife+ ships', () => {
    expect(PDF_TOOLS).toHaveLength(21);
    expect(new Set(PDF_TOOLS.map((tool) => tool.id)).size).toBe(21);
  });

  it('gives every tool the things a screen needs', () => {
    for (const tool of PDF_TOOLS) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.tagline.length).toBeGreaterThan(0);
      expect(tool.detail.length).toBeGreaterThan(20);
      expect(CATEGORIES.map((category) => category.id)).toContain(tool.category);
      expect(tool.icon.length).toBeGreaterThan(0);
      expect(['pdf', 'zip', 'txt', 'png', 'jpg', 'webp']).toContain(tool.output.extension);
    }
  });

  it('never gives two tools the same id or suffix', () => {
    const suffixes = PDF_TOOLS.map((tool) => tool.output.suffix);
    expect(new Set(suffixes).size).toBe(suffixes.length);
  });

  it('files every tool under a category', () => {
    const total = CATEGORIES.reduce((sum, category) => sum + toolsIn(category.id).length, 0);
    expect(total).toBe(PDF_TOOLS.length);
  });

  it('finds tools by name, purpose and category', () => {
    expect(searchTools('rotate').map((tool) => tool.id)).toEqual(['rotate']);
    expect(searchTools('password').map((tool) => tool.id)).toEqual(
      expect.arrayContaining(['protect', 'unlock']),
    );
    expect(searchTools('convert').length).toBeGreaterThan(3);
    expect(searchTools('')).toHaveLength(21);
    expect(searchTools('nothing-matches-this')).toHaveLength(0);
  });

  it('looks tools up by id', () => {
    expect(findTool('merge')?.name).toBe('Merge');
    expect(findTool('nope')).toBeUndefined();
  });

  it('gives every tool a usable default for each control', () => {
    const withDefaults = (tool: PdfTool) =>
      tool.options.filter((option) => option.kind !== 'signature' && option.kind !== 'note');

    for (const tool of PDF_TOOLS) {
      const defaults = defaultsFor(tool);
      for (const option of withDefaults(tool)) {
        expect(defaults[option.id]).toBeDefined();
      }
    }
  });

  it('defaults to every page rather than a surprise subset', () => {
    for (const tool of PDF_TOOLS) {
      const range = tool.options.find((option) => option.kind === 'range');
      if (range) expect(defaultsFor(tool)[range.id]).toBe('all');
    }
  });

  it('asks for a password on both sides of encryption', () => {
    expect(findTool('protect')?.options.some((option) => option.kind === 'text' && (option as { secure?: boolean }).secure)).toBe(true);
    expect(findTool('unlock')?.options.some((option) => option.kind === 'text' && (option as { secure?: boolean }).secure)).toBe(true);
  });

  it('marks compare as a report, not a file', () => {
    expect(findTool('compare')?.reportsOnly).toBe(true);
    expect(findTool('merge')?.reportsOnly).toBeUndefined();
    expect(findTool('compare')?.input).toBe('two');
  });
});

describe('formatting', () => {
  it('formats sizes the way a file manager does', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB');
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
  });

  it('reports a saving only when there is one', () => {
    expect(formatSaving(1000, 620)).toBe('38% smaller');
    expect(formatSaving(1000, 1000)).toBeNull();
    expect(formatSaving(1000, 1200)).toBeNull();
    expect(formatSaving(0, 10)).toBeNull();
  });

  it('names the output after the input', () => {
    expect(outputNameFor('Notes.pdf', '-compressed', 'pdf')).toBe('Notes-compressed.pdf');
    expect(outputNameFor('content://x/My%20Taxes.pdf', '-split', 'pdf')).toBe('My Taxes-split.pdf');
    expect(outputNameFor('', '-merged', 'pdf')).toBe('document-merged.pdf');
  });

  it('formats durations', () => {
    expect(formatDuration(400)).toBe('400 ms');
    expect(formatDuration(1400)).toBe('1.4s');
    expect(formatDuration(61_000)).toBe('1m 1s');
  });
});

describe('the settings line', () => {
  it('says which way a rotation will go, before it runs', () => {
    const rotate = findTool('rotate');
    expect(rotate).not.toBeNull();

    const defaults = defaultsFor(rotate!);
    expect(summariseOptions(rotate!, defaults)).toBe('90° right · all pages');

    expect(summariseOptions(rotate!, { ...defaults, angle: '270', pages: '2-3' })).toBe(
      '90° left · pages 2-3',
    );
  });

  it('describes the numbers a tool will use', () => {
    const watermark = findTool('watermark');
    expect(watermark).not.toBeNull();

    const summary = summariseOptions(watermark!, defaultsFor(watermark!));
    expect(summary).toContain('“Confidential”');
    expect(summary).toContain('%');
  });

  it('never prints a password', () => {
    const protect = findTool('protect');
    expect(protect).not.toBeNull();

    const summary = summariseOptions(protect!, { ...defaultsFor(protect!), password: 'hunter22' });
    expect(summary).not.toContain('hunter22');
    expect(summary).toContain('password set');
  });
});
