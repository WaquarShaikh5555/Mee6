/**
 * Every tool, checked against everything it depends on.
 *
 * The catalogue, the controls and the Kotlin dispatcher are three separate
 * files that must agree. Nothing in TypeScript can see the third one, so this
 * reads it: a tool in the catalogue with no branch in `PdfEngine.run` is a
 * button that does nothing, and that is exactly the failure a person cannot
 * diagnose from the screen.
 *
 * These are structural tests, not behavioural ones — the arithmetic lives in
 * pdfCore. What is asserted here is that every part is attached.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PDF_TOOLS, defaultsFor, findTool, describeRotation, summariseOptions } from '@/pdf/catalog';

const ROOT = join(__dirname, '..');
const KOTLIN = join(ROOT, 'modules/pdf/android/src/main/java/expo/modules/pdfarena');
const ENGINE = join(KOTLIN, 'PdfEngine.kt');
const CONTROLS = join(ROOT, 'src/pdf/components/ToolControls.tsx');

const engineSource = readFileSync(ENGINE, 'utf8');
const controlsSource = readFileSync(CONTROLS, 'utf8');

/** Every `"tool-id" ->` branch inside the dispatcher. */
function dispatchedTools(): string[] {
  return [...engineSource.matchAll(/"([a-z0-9-]+)"\s*->/g)].map((match) => match[1]!);
}

/** Every `case 'kind':` the control renderer knows. */
function renderedKinds(): string[] {
  const body = controlsSource.slice(
    controlsSource.indexOf('export function ToolField'),
    controlsSource.indexOf('/* ------------------------------------------------------------------ range --- */'),
  );
  return [...body.matchAll(/case '([a-z]+)':/g)].map((match) => match[1]!);
}

/**
 * Compare reports figures rather than writing a file, so it lives beside the
 * dispatcher instead of inside it. Its absence from `run` is correct.
 */
const BESIDE_THE_DISPATCHER = new Set(['compare']);

describe('every tool is attached to an engine branch', () => {
  it('dispatches all twenty-one ids', () => {
    const branches = dispatchedTools();

    for (const tool of PDF_TOOLS) {
      const dispatched =
        branches.includes(tool.id) || BESIDE_THE_DISPATCHER.has(tool.id);
      expect({ id: tool.id, dispatched }).toEqual({ id: tool.id, dispatched: true });
    }
  });

  it('has no branch for a tool that does not exist', () => {
    const ids = new Set(PDF_TOOLS.map((tool) => tool.id));

    for (const branch of dispatchedTools()) {
      expect({ branch, known: ids.has(branch as never) }).toEqual({ branch, known: true });
    }
  });

  it('has a real compare behind the tool that reports only', () => {
    const optimise = readFileSync(join(KOTLIN, 'PdfOptimise.kt'), 'utf8');
    expect(optimise).toContain('fun compare(');
  });
});

describe('every control the catalogue asks for is rendered', () => {
  it('handles each option kind in use', () => {
    const kinds = new Set<string>();
    for (const tool of PDF_TOOLS) {
      for (const option of tool.options) kinds.add(option.kind);
    }

    const rendered = renderedKinds();
    for (const kind of kinds) {
      expect({ kind, rendered: rendered.includes(kind) }).toEqual({ kind, rendered: true });
    }
  });
});

describe('no tool starts in a state that cannot work', () => {
  it('never defaults a destructive tool to every page', () => {
    const remove = findTool('delete');
    expect(remove).not.toBeNull();
    expect(defaultsFor(remove!).pages).toBe('');
  });

  it('defaults rotate to a real turn, and can be turned either way', () => {
    const rotate = findTool('rotate');
    expect(rotate).not.toBeNull();

    const defaults = defaultsFor(rotate!);
    expect(defaults.angle).toBe('90');
    expect(describeRotation(defaults.angle)).toBe('90° clockwise');

    // What the arrows produce, in order: 90 → 180 → 270 → 0 → 90.
    const turn = (value: number, direction: 1 | -1) =>
      String((value + direction * 90 + 360) % 360);

    expect(turn(90, 1)).toBe('180');
    expect(turn(180, 1)).toBe('270');
    expect(turn(270, 1)).toBe('0');
    expect(turn(0, -1)).toBe('270');
    expect(describeRotation('180')).toBe('half a turn');
    expect(describeRotation('270')).toBe('90° anticlockwise');
    expect(describeRotation('0')).toBe('no turn');
  });

  it('asks for a password before it can lock a file', () => {
    const protect = findTool('protect');
    expect(protect).not.toBeNull();

    const password = protect!.options.find(
      (option) => option.kind !== 'note' && option.id === 'password',
    );
    expect(password).toBeDefined();
    expect(password && 'default' in password ? password.default : '').toBe('');
  });

  it('starts every tool with a value for each option it renders', () => {
    for (const tool of PDF_TOOLS) {
      const defaults = defaultsFor(tool);

      for (const option of tool.options) {
        if (option.kind === 'note' || option.kind === 'signature' || option.kind === 'bookmarks') {
          continue;
        }

        expect({ tool: tool.id, option: option.id, defined: option.id in defaults }).toEqual({
          tool: tool.id,
          option: option.id,
          defined: true,
        });
      }
    }
  });

  it('summarises every tool without throwing', () => {
    for (const tool of PDF_TOOLS) {
      expect(() => summariseOptions(tool, defaultsFor(tool))).not.toThrow();
    }
  });
});

describe('the engine handles the awkward files it will really meet', () => {
  it('reads text through inherited page resources', () => {
    // Extraction used to read only `page.resources`, which is empty on most
    // documents produced by a design tool; the resources live on the parent.
    const convert = readFileSync(join(KOTLIN, 'PdfConvert.kt'), 'utf8');
    expect(convert).toContain('fun resourcesOf(');
    expect(convert).toContain('COSName.PARENT');
  });

  it('writes extracted text as UTF-8 with a byte order mark', () => {
    // Without the mark, Windows and several Android viewers show Hindi, Arabic
    // and Chinese as mojibake.
    expect(engineSource).not.toBeNull();
    expect(readFileSync(join(KOTLIN, 'PdfConvert.kt'), 'utf8')).toContain(
      '0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()',
    );
  });

  it('falls back to raw glyphs when a font has no character map', () => {
    const convert = readFileSync(join(KOTLIN, 'PdfConvert.kt'), 'utf8');

    expect(convert).toContain('processTextPosition');
    expect(convert).toContain('class Glyphs');
  });

  it('never calls a bigger file compressed', () => {
    const optimise = readFileSync(join(KOTLIN, 'PdfOptimise.kt'), 'utf8');

    expect(optimise).toContain('newSize >= started');
  });
});
