import {
  describePayload,
  inkBounds,
  isEmptySignature,
  isSigned,
  parsePayload,
  parseSignature,
  payloadJson,
  signatureJson,
  strokePath,
} from '@/pdf/signature';
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

describe('a signature on a page', () => {
  const ink = {
    kind: 'strokes' as const,
    colour: '#A31621',
    strokes: [
      [
        { x: 0.1, y: 0.4 },
        { x: 0.6, y: 0.2 },
      ],
    ],
  };

  it('round-trips ink, colour and placement', () => {
    const payload = {
      ...ink,
      placements: [{ page: 2, x: 0.5, y: 0.3, w: 0.4, rotation: 6 }],
    };

    const restored = parsePayload(payloadJson(payload));

    expect(restored).toEqual(payload);
  });

  it('round-trips a photographed signature', () => {
    const payload = {
      kind: 'photo' as const,
      file: 'file:///data/signature-source/a.png',
      aspect: 0.31,
      placements: [{ page: 1, x: 0.2, y: 0.8, w: 0.5, rotation: 0 }],
    };

    expect(parsePayload(payloadJson(payload))).toEqual(payload);
  });

  it('keeps placements on the page and sizes sane', () => {
    const payload = {
      ...ink,
      placements: [{ page: 0, x: 4, y: -2, w: 12, rotation: 400 }],
    };

    const restored = parsePayload(payloadJson(payload))!;
    const [placement] = restored.placements;

    expect(placement!.page).toBe(1);
    expect(placement!.x).toBe(1);
    expect(placement!.y).toBe(0);
    expect(placement!.w).toBe(1);
  });

  it('is not signed until it has been placed', () => {
    expect(isSigned({ ...ink, placements: [] })).toBe(false);
    expect(isSigned({ ...ink, placements: [{ page: 1, x: 0.5, y: 0.5, w: 0.3, rotation: 0 }] })).toBe(true);
    expect(isSigned(null)).toBe(false);
  });

  it('describes itself for the settings line', () => {
    expect(describePayload(null)).toBe('No signature yet');
    expect(describePayload({ ...ink, placements: [] })).toBe('Signature ready — not placed yet');
    expect(describePayload({ ...ink, placements: [{ page: 3, x: 0.5, y: 0.5, w: 0.3, rotation: 0 }] })).toBe(
      'On page 3',
    );
  });

  it('reads a photo payload whose numbers are rubbish', () => {
    const payload = parsePayload(
      JSON.stringify({ kind: 'photo', file: 'file:///x.png', placements: [{ page: 1 }] }),
    )!;

    expect(payload.kind).toBe('photo');
    if (payload.kind !== 'photo') return;
    // No aspect given: handwriting proportions, not a square.
    expect(payload.aspect).toBeGreaterThan(0.1);
    expect(payload.aspect).toBeLessThan(1);
  });

  it('measures the ink, so a preview can crop to it', () => {
    const bounds = inkBounds([
      [
        { x: 0.2, y: 0.5 },
        { x: 0.8, y: 0.3 },
      ],
    ]);

    expect(bounds.x).toBeLessThan(0.2);
    expect(bounds.x + bounds.w).toBeGreaterThan(0.8);
    expect(bounds.h).toBeGreaterThan(0.2);
  });
});
