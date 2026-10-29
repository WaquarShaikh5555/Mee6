/**
 * The signature has to be *visible* while it is placed.
 *
 * This is the regression that hurt: the ink was drawn with
 * `vectorEffect="non-scaling-stroke"` and `strokeWidth={0.008}`, which makes
 * Android read the width as **screen pixels** — a line 8 thousandths of a pixel
 * wide. The signature existed, the placement existed, "Place" worked, and the
 * page looked empty.
 *
 * So these tests do not assert that a `Path` exists. They assert the `Path` is
 * *drawable*: a stroke width in the ink's own units, no non-scaling effect, and
 * a frame around it so there is something to put a finger on.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { ReactNode } from 'react';

import { ThemeProvider } from '@/theme/ThemeProvider';
import { SignaturePlacementSheet } from '@/pdf/components/SignaturePlacementSheet';
import { ToolField } from '@/pdf/components/ToolControls';
import { inkBounds, payloadJson, strokeWeight, type Stroke } from '@/pdf/signature';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(),
}));

/**
 * React 19's root is concurrent, so `render` here is asynchronous: `screen` is
 * only populated once the promise resolves. Every test awaits this.
 */
async function wrap(node: ReactNode) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

/** A signature that looks like a signature: a diagonal stroke and a flick. */
const STROKES: Stroke[] = [
  [
    { x: 0.1, y: 0.2 },
    { x: 0.2, y: 0.14 },
    { x: 0.3, y: 0.22 },
    { x: 0.42, y: 0.18 },
  ],
  [
    { x: 0.20, y: 0.19 },
    { x: 0.34, y: 0.30 },
  ],
];

const ONE_PLACEMENT = [{ page: 1, x: 0.5, y: 0.22, w: 0.34, rotation: 0 }];

/** Every `d`-bearing SVG path in the tree, with its props. */
function inkPaths() {
  const found: { d: string; strokeWidth?: number; vectorEffect?: string }[] = [];

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;

    const element = node as { props?: Record<string, unknown>; children?: unknown[] };
    const props = element.props ?? {};

    if (typeof props.d === 'string') {
      found.push({
        d: props.d,
        strokeWidth: props.strokeWidth as number | undefined,
        vectorEffect: props.vectorEffect as string | undefined,
      });
    }

    for (const child of element.children ?? []) walk(child);
  };

  walk(screen.toJSON());
  return found;
}

/** The stage is only drawn once it has been measured, as on a real screen. */
async function measureStage(width = 320, height = 460) {
  await fireEvent(screen.getByTestId('signature-stage'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
  });
}

describe('the ink is drawable, not merely present', () => {
  it('gives a stroke a width in the ink’s own units', () => {
    // 1.2% of the ink's width: a pen at any size.
    expect(strokeWeight(0.5)).toBeCloseTo(0.006, 6);
    expect(strokeWeight(2)).toBeCloseTo(0.024, 6);
    // A degenerate box still has to draw something.
    expect(strokeWeight(0)).toBeGreaterThan(0);
    expect(strokeWeight(Number.NaN)).toBeGreaterThan(0);
  });

  it('draws the signature on the page at a visible weight', async () => {
    await wrap(
      <SignaturePlacementSheet
        inline
        visible
        ink={{ kind: 'strokes', strokes: STROKES, colour: '#111111' }}
        uri="file:///documents/Contract.pdf"
        pageCount={4}
        initial={ONE_PLACEMENT}
        onCancel={() => {}}
        onDone={() => {}}
      />,
    );

    await measureStage();

    const paths = inkPaths();
    expect(paths.length).toBeGreaterThan(0);

    const bounds = inkBounds(STROKES);
    const expected = strokeWeight(bounds.w);

    for (const path of paths) {
      // The bug: 0.008 pixels because of the non-scaling effect.
      expect(path.vectorEffect).toBeUndefined();
      expect(path.strokeWidth).toBeCloseTo(expected, 6);
      // Anything under a thousandth of the ink's width cannot be seen.
      expect(path.strokeWidth!).toBeGreaterThan(0.001);
    }
  });

  it('frames the signature so it can be seen and grabbed', async () => {
    await wrap(
      <SignaturePlacementSheet
        inline
        visible
        ink={{ kind: 'strokes', strokes: STROKES, colour: '#111111' }}
        uri="file:///documents/Contract.pdf"
        pageCount={4}
        initial={ONE_PLACEMENT}
        onCancel={() => {}}
        onDone={() => {}}
      />,
    );

    await measureStage();

    expect(
      screen.getByLabelText('Your signature, on the page. Drag it, pinch to resize.'),
    ).toBeTruthy();
  });

  it('lands a fresh signature somewhere drag-able instead of nowhere', async () => {
    const onDone = jest.fn();

    await wrap(
      <SignaturePlacementSheet
        inline
        visible
        ink={{ kind: 'strokes', strokes: STROKES, colour: '#111111' }}
        uri="file:///documents/Contract.pdf"
        pageCount={4}
        initial={[]}
        onCancel={() => {}}
        onDone={onDone}
      />,
    );

    await measureStage();

    // No placement was handed in, so one is made on open — otherwise there is
    // an empty page and nothing to move.
    await fireEvent.press(screen.getByLabelText('Place the signature'));

    expect(onDone).toHaveBeenCalledTimes(1);
    const placements = onDone.mock.calls[0]![0];
    expect(placements).toHaveLength(1);
    expect(placements[0]).toMatchObject({ page: 1 });
    expect(placements[0].w).toBeGreaterThan(0);
  });

  it('says so plainly when there is no signature to place', async () => {
    await wrap(
      <SignaturePlacementSheet
        inline
        visible
        ink={null}
        uri="file:///documents/Contract.pdf"
        pageCount={4}
        initial={[]}
        onCancel={() => {}}
        onDone={() => {}}
      />,
    );

    await measureStage();

    expect(screen.getByText(/There is no signature to place/)).toBeTruthy();
  });
});

describe('from the tool screen', () => {
  const signature = { kind: 'signature' as const, id: 'signature', label: 'Signature' };

  const payload = payloadJson({
    kind: 'strokes',
    strokes: STROKES,
    colour: '#111111',
    placements: ONE_PLACEMENT,
  });

  it('opens the editor with the signature already on the page', async () => {
    await wrap(
      <ToolField
        option={signature}
        value={payload}
        onChange={() => {}}
        pageCount={4}
        uri="file:///documents/Contract.pdf"
      />,
    );

    expect(screen.getByText('On page 1')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Change where the signature goes'));

    expect(screen.getByText('Place your signature')).toBeTruthy();

    await measureStage();

    // The same ink, at the same visible weight, inside the editor.
    const paths = inkPaths();
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((path) => path.vectorEffect === undefined)).toBe(true);
  });

  it('shows the signature in the card, not an empty white box', async () => {
    await wrap(
      <ToolField
        option={signature}
        value={payload}
        onChange={() => {}}
        pageCount={4}
        uri="file:///documents/Contract.pdf"
      />,
    );

    // The card draws the signature at thumbnail size — the same bug made this
    // blank, which read as "the signature was not saved".
    const paths = inkPaths();
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((path) => path.vectorEffect === undefined)).toBe(true);
    expect(paths.every((path) => (path.strokeWidth ?? 0) > 0.001)).toBe(true);
  });
});

describe('the props that made ink invisible', () => {
  /** Every `.tsx` under `src`, so a new preview cannot reintroduce the bug. */
  function componentSources(dir = join(__dirname, '..', 'src')): { file: string; text: string }[] {
    const found: { file: string; text: string }[] = [];

    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);

      if (statSync(path).isDirectory()) {
        found.push(...componentSources(path));
      } else if (entry.endsWith('.tsx')) {
        found.push({ file: path, text: readFileSync(path, 'utf8') });
      }
    }

    return found;
  }

  it('never measures a stroke in screen pixels', () => {
    // `vectorEffect="non-scaling-stroke"` makes strokeWidth mean *pixels*, so a
    // number chosen to look like a fraction of the ink becomes sub-pixel and
    // the signature draws nothing at all. There is no case here that wants it.
    // Matches the prop (`vectorEffect="…"` or `vectorEffect={…}`), not the
    // comments that explain why it must never come back.
    const offenders = componentSources()
      .filter((entry) => /\bvectorEffect\s*=/.test(entry.text))
      .map((entry) => entry.file);

    expect(offenders).toEqual([]);
  });
});

describe('the whole way through', () => {
  const signature = { kind: 'signature' as const, id: 'signature', label: 'Signature' };

  it('draw → Use → place → a payload with a spot on the page', async () => {
    const onChange = jest.fn();

    await wrap(
      <ToolField
        option={signature}
        // Opening "Change" starts from ink that already exists, which is the
        // same state the pad is in the moment after a stroke is drawn.
        value={payloadJson({
          kind: 'strokes',
          strokes: STROKES,
          colour: '#111111',
          placements: [],
        })}
        onChange={onChange}
        pageCount={4}
        uri="file:///documents/Contract.pdf"
      />,
    );

    await fireEvent.press(screen.getByLabelText('Change the signature'));
    expect(screen.getByText('Your signature')).toBeTruthy();

    // "Use" has to hand over to the page, not close on the tool screen.
    await fireEvent.press(screen.getByLabelText('Use this signature'));
    expect(screen.getByText('Place your signature')).toBeTruthy();

    await measureStage();

    // The ink is on the page, and the frame is there to grab.
    expect(inkPaths().length).toBeGreaterThan(0);
    expect(
      screen.getByLabelText('Your signature, on the page. Drag it, pinch to resize.'),
    ).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Place the signature'));

    const committed = JSON.parse(onChange.mock.calls[onChange.mock.calls.length - 1]![0] as string);
    expect(committed.kind).toBe('strokes');
    expect(committed.strokes.length).toBe(STROKES.length);
    expect(committed.placements).toHaveLength(1);
    expect(committed.placements[0]).toMatchObject({ page: 1 });
  });
});
