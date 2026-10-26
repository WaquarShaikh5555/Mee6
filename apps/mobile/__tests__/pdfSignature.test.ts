import { parseSignature, signatureJson, strokePath, isEmptySignature } from '@/pdf/signature';
import { formatBytes, mimeFor, outputNameFor } from '@/pdf/format';

describe('signature strokes', () => {
  it('round-trips through JSON', () => {
    const strokes = [
      [
        { x: 0.1, y: 0.2 },
        { x: 0.15, y: 0.24 },
      ],
      [{ x: 0.3, y: 0.1 }],
    ];

    const restored = parseSignature(signatureJson(strokes));

    expect(restored).toHaveLength(2);
    expect(restored[0]).toHaveLength(2);
    expect(restored[0]![0]).toEqual({ x: 0.1, y: 0.2 });
    expect(restored[1]![0]).toEqual({ x: 0.3, y: 0.1 });
  });

  it('serialises as flat point arrays, which is what the engine reads', () => {
    const json = signatureJson([
      [
        { x: 0.25, y: 0.5 },
        { x: 0.5, y: 0.75 },
      ],
    ]);

    expect(JSON.parse(json)).toEqual({ strokes: [[0.25, 0.5, 0.5, 0.75]] });
  });

  it('treats rubbish as an empty pad rather than throwing', () => {
    expect(parseSignature('not json')).toEqual([]);
    expect(parseSignature('{"strokes":"nope"}')).toEqual([]);
    expect(parseSignature(null)).toEqual([]);
    expect(parseSignature('{"strokes":[[1]]}')).toEqual([]);
  });

  it('keeps the real points and drops the rest', () => {
    // `Number(null)` is 0, so a type check matters: a null must not become a
    // point at the origin and drag a line across the page.
    expect(parseSignature('{"strokes":[[0.1,0.2,null,"x"]]}')).toEqual([
      [{ x: 0.1, y: 0.2 }],
    ]);
  });

  it('knows a tap is not a signature', () => {
    expect(isEmptySignature([[{ x: 0.1, y: 0.1 }]])).toBe(true);
    expect(
      isEmptySignature([
        [
          { x: 0.1, y: 0.1 },
          { x: 0.2, y: 0.2 },
        ],
      ]),
    ).toBe(false);
  });

  it('draws a path through every point', () => {
    const path = strokePath(
      [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
        { x: 0.3, y: 0.1 },
      ],
      100,
      100,
    );

    expect(path.startsWith('M 10 10')).toBe(true);
    expect(path).toContain('Q');
    expect(path).toContain('30 10');
  });

  it('makes a dot drawable for a single-point stroke', () => {
    expect(strokePath([{ x: 0.5, y: 0.5 }], 100, 100)).toContain('M 50 50');
  });
});

describe('output names', () => {
  it('keeps the base name and adds the tool suffix', () => {
    expect(outputNameFor('Notes.pdf', '-compressed', 'pdf')).toBe('Notes-compressed.pdf');
    expect(outputNameFor('a/b/Scan 01.pdf', '-merged', 'pdf')).toBe('Scan 01-merged.pdf');
    expect(outputNameFor('Report.PDF', '', 'txt')).toBe('Report.txt');
  });

  it('falls back when there is no usable name', () => {
    expect(outputNameFor('', '-split', 'pdf')).toBe('document-split.pdf');
  });
});

describe('formatting', () => {
  it('reads sizes the way a person would', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(48_000_000)).toBe('46 MB');
  });

  it('maps a result name to a share type', () => {
    expect(mimeFor('a-compressed.pdf')).toBe('application/pdf');
    expect(mimeFor('a-pages.zip')).toBe('application/zip');
    expect(mimeFor('a.txt')).toBe('text/plain');
    expect(mimeFor('a-images.zip')).toBe('application/zip');
  });
});
