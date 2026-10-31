/**
 * PDF Arena's tools, as data.
 *
 * Every screen in the feature reads from here: the Arena grid, the search box,
 * the tool screen's controls, and the engine's request. A tool with no bespoke
 * screen at all is the point — adding the twenty-second tool means adding an
 * entry, not a file.
 *
 * The engine is told only `id`, the files, and an options record. Everything a
 * person sees comes from this list, so the interface and the engine cannot
 * drift apart.
 */

import type { Ionicons } from '@expo/vector-icons';

import { describePayload, parsePayload } from './signature';

export type PdfCategory = 'Edit' | 'Optimise' | 'Secure' | 'Convert';

export type Choice = { value: string; label: string; hint?: string };

export type ToolOption =
  /** Page range text, validated against the document's page count. */
  | { kind: 'range'; id: string; label: string; hint: string; default: string }
  | { kind: 'choice'; id: string; label: string; choices: Choice[]; default: string }
  | {
      kind: 'text';
      id: string;
      label: string;
      placeholder?: string;
      maxLength?: number;
      default: string;
      /** Rendered as a password field, never echoed back. */
      secure?: boolean;
      hint?: string;
    }
  | {
      kind: 'number';
      id: string;
      label: string;
      min: number;
      max: number;
      default: number;
      suffix?: string;
    }
  | {
      kind: 'slider';
      id: string;
      label: string;
      min: number;
      max: number;
      step: number;
      default: number;
      format: (value: number) => string;
    }
  | { kind: 'toggle'; id: string; label: string; hint?: string; default: boolean }
  /** The signature pad and its controls. */
  | { kind: 'signature'; id: string; label: string }
  /** Reorder pages by tapping them; produces a comma separated order. */
  | { kind: 'order'; id: string; label: string; hint: string }
  /** Arrows around the page itself: the turn is something you do, not pick. */
  | { kind: 'rotation'; id: string; label: string; default: string }
  /** Ink for text drawn onto a page: swatches, because colour is seen. */
  | {
      kind: 'colour';
      id: string;
      label: string;
      default: string;
      swatches: { value: string; label: string }[];
    }
  /** The document outline, edited in place. */
  | { kind: 'bookmarks'; id: string; label: string }
  /** Explanatory text, not an input. */
  | { kind: 'note'; text: string };

export type PdfToolId =
  | 'merge'
  | 'split'
  | 'delete'
  | 'rearrange'
  | 'rotate'
  | 'sign'
  | 'watermark'
  | 'page-numbers'
  | 'bookmarks'
  | 'compress'
  | 'grayscale'
  | 'repair'
  | 'compare'
  | 'protect'
  | 'unlock'
  | 'metadata'
  | 'pdf2img'
  | 'img2pdf'
  | 'pdf2zip'
  | 'extract-images'
  | 'pdf2text';

export type PdfTool = {
  id: PdfToolId;
  name: string;
  /** One line, under the name. Says what it does, not how. */
  tagline: string;
  /** Two or three sentences on the tool screen. */
  detail: string;
  category: PdfCategory;
  icon: keyof typeof Ionicons.glyphMap;
  /** What has to be supplied before it can run. */
  input: 'pdf' | 'pdfs' | 'images' | 'two';
  options: ToolOption[];
  output: {
    extension: 'pdf' | 'zip' | 'txt' | 'png' | 'jpg' | 'webp';
    /** Appended to the input's name: `notes` + `-compressed` + `.pdf`. */
    suffix: string;
  };
  /** The result is a single figure rather than a file (Compare). */
  reportsOnly?: boolean;
  /**
   * Part of the paid set: open while the 48-hour unlock is running.
   *
   * Everything a person needs to *finish* a document is free — read it, merge
   * it, split it, turn it, delete pages, sign it. The per-tool maths is that a
   * tool used once a month can wait for an unlock, and a tool used every day
   * must never be a toll booth.
   */
  pro?: boolean;
};

export const CATEGORIES: { id: PdfCategory; blurb: string }[] = [
  { id: 'Edit', blurb: 'Pages, marks and structure' },
  { id: 'Optimise', blurb: 'Smaller, cleaner, checked' },
  { id: 'Secure', blurb: 'Locked, unlocked, described' },
  { id: 'Convert', blurb: 'Out of the PDF, or into one' },
];

/** The inks a mark drawn onto a page may use. */
const inks: { value: string; label: string }[] = [
  { value: '#111111', label: 'Black' },
  { value: '#6E6E6E', label: 'Grey' },
  { value: '#A31621', label: 'Red' },
  { value: '#1D2A6B', label: 'Navy' },
  { value: '#0B6B4F', label: 'Green' },
];

const pagesAll: ToolOption = {
  kind: 'range',
  id: 'pages',
  label: 'Pages',
  hint: 'For example 1-3, 7. Leave as “all” for every page.',
  default: 'all',
};

export const PDF_TOOLS: PdfTool[] = [
  /* ------------------------------------------------------------- Edit --- */
  {
    id: 'merge',
    name: 'Merge',
    tagline: 'Several documents into one',
    detail:
      'Pages are copied in the order you pick them, with each file’s own page size and orientation kept. Add as many as you like.',
    category: 'Edit',
    icon: 'layers-outline',
    input: 'pdfs',
    options: [],
    output: { extension: 'pdf', suffix: '-merged' },
  },
  {
    id: 'split',
    name: 'Split',
    tagline: 'Pull pages out into a document',
    detail:
      'Extract the pages you name into a new file — or make one file per page and share them individually.',
    category: 'Edit',
    icon: 'cut-outline',
    input: 'pdf',
    options: [
      pagesAll,
      {
        kind: 'choice',
        id: 'mode',
        label: 'Output',
        default: 'single',
        choices: [
          { value: 'single', label: 'One file', hint: 'All chosen pages together' },
          { value: 'separate', label: 'One per page', hint: 'Returned as a ZIP' },
        ],
      },
    ],
    output: { extension: 'pdf', suffix: '-split' },
  },
  {
    id: 'delete',
    name: 'Delete pages',
    tagline: 'Take pages out',
    detail: 'Everything you do not name is kept, in the same order, with its bookmarks and links intact.',
    category: 'Edit',
    icon: 'trash-outline',
    input: 'pdf',
    options: [
      {
        ...pagesAll,
        label: 'Pages to remove',
        hint: 'For example 2, 5-7. Everything you do not name is kept.',
        // Never "all": a delete that removes the whole document on a stray tap
        // is not a default, it is a trap.
        default: '',
      } as ToolOption,
    ],
    output: { extension: 'pdf', suffix: '-edited' },
  },
  {
    id: 'rearrange',
    name: 'Rearrange',
    tagline: 'Put pages in a new order',
    detail:
      'Tap the pages in the order you want them. Tap a number again to take it back out; the document is rebuilt only when you run it.',
    category: 'Edit',
    icon: 'swap-vertical-outline',
    input: 'pdf',
    options: [
      {
        kind: 'order',
        id: 'order',
        label: 'New order',
        hint: 'Tap pages below. Anything you leave out is dropped.',
      },
    ],
    output: { extension: 'pdf', suffix: '-ordered' },
  },
  {
    id: 'rotate',
    name: 'Rotate',
    tagline: 'Fix the orientation',
    detail:
      'Choose the turn — 90°, 180° or 90° the other way — and see page 1 turned before anything is written. Text stays selectable.',
    category: 'Edit',
    icon: 'refresh-outline',
    input: 'pdf',
    options: [
      { kind: 'rotation', id: 'angle', label: 'Turn the pages', default: '90' },
      pagesAll,
    ],
    output: { extension: 'pdf', suffix: '-rotated' },
  },
  {
    id: 'sign',
    name: 'Sign',
    tagline: 'Add your signature',
    detail:
      'Draw your signature once — in black, navy, blue or red — or use a photo of one on paper. Then drag it anywhere on the page and pinch to size it. Kept on this phone for next time.',
    category: 'Edit',
    icon: 'pencil-outline',
    input: 'pdf',
    options: [{ kind: 'signature', id: 'signature', label: 'Signature' }],
    output: { extension: 'pdf', suffix: '-signed' },
  },
  {
    id: 'watermark',
    name: 'Watermark',
    tagline: 'A line across every page',
    detail:
      'Text drawn under nothing and over nothing — it sits above the page content at the opacity you choose.',
    category: 'Edit',
    icon: 'water-outline',
    input: 'pdf',
    options: [
      {
        kind: 'text',
        id: 'text',
        label: 'Text',
        placeholder: 'Confidential',
        maxLength: 60,
        default: 'Confidential',
      },
      {
        kind: 'colour',
        id: 'colour',
        label: 'Ink',
        default: inks[1]!.value,
        swatches: inks,
      },
      {
        kind: 'slider',
        id: 'opacity',
        label: 'Opacity',
        min: 5,
        max: 100,
        step: 5,
        default: 20,
        format: (value) => `${value}%`,
      },
      {
        kind: 'choice',
        id: 'angle',
        label: 'Angle',
        default: '45',
        choices: [
          { value: '45', label: 'Diagonal' },
          { value: '0', label: 'Level' },
          { value: '-45', label: 'Reverse' },
        ],
      },
      {
        kind: 'slider',
        id: 'size',
        label: 'Size',
        min: 20,
        max: 120,
        step: 2,
        default: 56,
        format: (value) => `${value} pt`,
      },
      pagesAll,
    ],
    output: { extension: 'pdf', suffix: '-watermarked' },
    pro: true,
  },
  {
    id: 'page-numbers',
    name: 'Page numbers',
    tagline: 'Number the pages',
    detail:
      'Write the number however you like — “{n}”, “Page {n} of {total}”, “- {n} -”. The numbering can start anywhere.',
    category: 'Edit',
    icon: 'list-outline',
    input: 'pdf',
    options: [
      {
        kind: 'text',
        id: 'format',
        label: 'Format',
        placeholder: 'Page {n} of {total}',
        maxLength: 40,
        default: 'Page {n} of {total}',
        hint: '{n} is the page number, {total} is the count.',
      },
      {
        kind: 'choice',
        id: 'position',
        label: 'Position',
        default: 'bottom-right',
        choices: [
          { value: 'bottom-left', label: 'Bottom left' },
          { value: 'bottom-center', label: 'Bottom centre' },
          { value: 'bottom-right', label: 'Bottom right' },
          { value: 'top-left', label: 'Top left' },
          { value: 'top-center', label: 'Top centre' },
          { value: 'top-right', label: 'Top right' },
        ],
      },
      { kind: 'colour', id: 'colour', label: 'Ink', default: inks[1]!.value, swatches: inks },
      { kind: 'number', id: 'start', label: 'Start at', min: 1, max: 9999, default: 1 },
      {
        kind: 'slider',
        id: 'size',
        label: 'Text size',
        min: 6,
        max: 24,
        step: 1,
        default: 10,
        format: (value) => `${value} pt`,
      },
    ],
    output: { extension: 'pdf', suffix: '-numbered' },
    pro: true,
  },
  {
    id: 'bookmarks',
    name: 'Bookmarks',
    tagline: 'The document’s contents list',
    detail:
      'Bookmarks are what a reader shows as the contents pane. Anything here replaces the document’s existing list.',
    category: 'Edit',
    icon: 'bookmark-outline',
    input: 'pdf',
    options: [{ kind: 'bookmarks', id: 'bookmarks', label: 'Entries' }],
    output: { extension: 'pdf', suffix: '-bookmarked' },
    pro: true,
  },

  /* --------------------------------------------------------- Optimise --- */
  {
    id: 'compress',
    name: 'Compress',
    tagline: 'Smaller without going fuzzy',
    detail:
      'The photographs inside the document are re-encoded and scaled down. Text and line art are left exactly as they are, so the page stays sharp. If a file cannot get smaller, you are told so and handed it back unchanged.',
    category: 'Optimise',
    icon: 'contract-outline',
    input: 'pdf',
    options: [
      {
        kind: 'choice',
        id: 'level',
        label: 'How hard',
        default: 'recommended',
        choices: [
          { value: 'light', label: 'Light', hint: 'Best quality' },
          { value: 'recommended', label: 'Recommended', hint: 'A good trade' },
          { value: 'extreme', label: 'Extreme', hint: 'Smallest file' },
        ],
      },
    ],
    output: { extension: 'pdf', suffix: '-compressed' },
  },
  {
    id: 'grayscale',
    name: 'Grayscale',
    tagline: 'Black and white, for printing',
    detail:
      'Each page is redrawn in grey at a resolution that keeps text legible. The result is a picture of the page, so its text is no longer selectable.',
    category: 'Optimise',
    icon: 'contrast-outline',
    input: 'pdf',
    options: [
      {
        kind: 'note',
        text: 'Choose this when you are printing, or when the colour is the only thing making the file large.',
      },
    ],
    output: { extension: 'pdf', suffix: '-gray' },
    pro: true,
  },
  {
    id: 'repair',
    name: 'Repair',
    tagline: 'Rebuild a broken file',
    detail:
      'Reads the document as leniently as possible, then writes a clean copy. Works on files that will not open, and on ones that open but refuse to save.',
    category: 'Optimise',
    icon: 'medkit-outline',
    input: 'pdf',
    options: [],
    output: { extension: 'pdf', suffix: '-repaired' },
    pro: true,
  },
  {
    id: 'compare',
    name: 'Compare',
    tagline: 'What changed between two versions',
    detail:
      'Both documents are drawn at the same size and matched page by page. Pages that differ are listed with how much of the page changed.',
    category: 'Optimise',
    icon: 'git-compare-outline',
    input: 'two',
    options: [],
    output: { extension: 'pdf', suffix: '-compared' },
    reportsOnly: true,
    pro: true,
  },

  /* ----------------------------------------------------------- Secure --- */
  {
    id: 'protect',
    name: 'Protect',
    tagline: 'Require a password',
    detail:
      'AES-128 encryption: the file cannot be opened at all without the password. There is no recovery — keep the password somewhere safe.',
    category: 'Secure',
    icon: 'lock-closed-outline',
    input: 'pdf',
    options: [
      {
        kind: 'text',
        id: 'password',
        label: 'Password',
        placeholder: 'At least 4 characters',
        maxLength: 64,
        default: '',
        secure: true,
        hint: 'If you lose this, the file cannot be opened again.',
      },
    ],
    output: { extension: 'pdf', suffix: '-protected' },
    pro: true,
  },
  {
    id: 'unlock',
    name: 'Unlock',
    tagline: 'Remove a password you know',
    detail:
      'Opening with the correct password and saving without it. This does not crack anything — it needs the password the document was locked with.',
    category: 'Secure',
    icon: 'lock-open-outline',
    input: 'pdf',
    options: [
      {
        kind: 'text',
        id: 'password',
        label: 'Current password',
        placeholder: 'The password on this file',
        maxLength: 64,
        default: '',
        secure: true,
      },
    ],
    output: { extension: 'pdf', suffix: '-unlocked' },
    pro: true,
  },
  {
    id: 'metadata',
    name: 'Metadata',
    tagline: 'Title, author, keywords',
    detail:
      'The details a reader shows in its properties panel and that search engines index. Clearing a field removes it rather than leaving it blank.',
    category: 'Secure',
    icon: 'information-circle-outline',
    input: 'pdf',
    options: [
      { kind: 'text', id: 'title', label: 'Title', maxLength: 200, default: '' },
      { kind: 'text', id: 'author', label: 'Author', maxLength: 120, default: '' },
      { kind: 'text', id: 'subject', label: 'Subject', maxLength: 200, default: '' },
      {
        kind: 'text',
        id: 'keywords',
        label: 'Keywords',
        placeholder: 'receipt, 2026, tax',
        maxLength: 200,
        default: '',
      },
    ],
    output: { extension: 'pdf', suffix: '-tagged' },
    pro: true,
  },

  /* ---------------------------------------------------------- Convert --- */
  {
    id: 'pdf2img',
    name: 'To images',
    tagline: 'Every page as a picture',
    detail:
      'Rendered by Android’s own PDF renderer, so what you see is exactly what the page looks like. Every page becomes its own picture, shown here as soon as it is made — no archive to dig through.',
    category: 'Convert',
    icon: 'images-outline',
    input: 'pdf',
    options: [
      pagesAll,
      {
        kind: 'choice',
        id: 'format',
        label: 'Format',
        default: 'png',
        choices: [
          { value: 'png', label: 'PNG', hint: 'Lossless' },
          { value: 'jpeg', label: 'JPEG', hint: 'Smaller' },
          { value: 'webp', label: 'WebP', hint: 'Smallest' },
        ],
      },
      {
        kind: 'choice',
        id: 'quality',
        label: 'Resolution',
        default: 'hd',
        choices: [
          { value: 'standard', label: 'Standard', hint: '1.5×' },
          { value: 'hd', label: 'HD', hint: '2×' },
          { value: 'ultra', label: 'Ultra', hint: '3×, large' },
        ],
      },
    ],
    output: { extension: 'png', suffix: '-images' },
  },
  {
    id: 'img2pdf',
    name: 'From images',
    tagline: 'Photos into a document',
    detail:
      'Each image becomes one page. “Fit to image” keeps the page the shape of the photo; A4 centres it on a full page.',
    category: 'Convert',
    icon: 'image-outline',
    input: 'images',
    options: [
      {
        kind: 'choice',
        id: 'pageSize',
        label: 'Page size',
        default: 'fit',
        choices: [
          { value: 'fit', label: 'Fit to image' },
          { value: 'a4', label: 'A4' },
        ],
      },
    ],
    output: { extension: 'pdf', suffix: '-from-images' },
  },
  {
    id: 'pdf2zip',
    name: 'To ZIP',
    tagline: 'One file per page',
    detail:
      'Every page becomes its own single-page PDF and the set is zipped. Useful for sending one chapter, or filing pages separately.',
    category: 'Convert',
    icon: 'archive-outline',
    input: 'pdf',
    options: [pagesAll],
    output: { extension: 'zip', suffix: '-pages' },
    pro: true,
  },
  {
    id: 'extract-images',
    name: 'Extract images',
    tagline: 'The pictures inside a PDF',
    detail:
      'Pulls the original image objects out of the document — photographs, logos, diagrams — at their full size, untouched by re-rendering. Each one is shown and saved separately.',
    category: 'Convert',
    icon: 'albums-outline',
    input: 'pdf',
    options: [pagesAll],
    output: { extension: 'png', suffix: '-assets' },
    pro: true,
  },
  {
    id: 'pdf2text',
    name: 'To text',
    tagline: 'The words, as plain text',
    detail:
      'Reads the document’s text layer and shows it right here, ready to select and copy, with a .txt copy to share. Scanned pages have no text layer, so they come out empty — that is the scan, not the tool.',
    category: 'Convert',
    icon: 'text-outline',
    input: 'pdf',
    options: [pagesAll],
    output: { extension: 'txt', suffix: '' },
  },
];

export const TOOL_INDEX: Record<string, PdfTool> = Object.fromEntries(
  PDF_TOOLS.map((tool) => [tool.id, tool]),
);

export function findTool(id: string): PdfTool | undefined {
  return TOOL_INDEX[id];
}

export function toolsIn(category: PdfCategory): PdfTool[] {
  return PDF_TOOLS.filter((tool) => tool.category === category);
}

/** Free-text search over name, tagline and category — what the Arena box uses. */
export function searchTools(query: string): PdfTool[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return PDF_TOOLS;

  return PDF_TOOLS.filter((tool) => {
    const haystack = `${tool.name} ${tool.tagline} ${tool.detail} ${tool.category}`.toLowerCase();
    return haystack.includes(needle);
  });
}

/** Default values for a tool's options, ready to hand to the engine. */
export const ROTATIONS = [0, 90, 180, 270] as const;

/** "90° clockwise" — never "90", which means nothing on its own. */
export function describeRotation(degrees: number | string): string {
  const value = ((Number(degrees) % 360) + 360) % 360;

  switch (value) {
    case 0:
      return 'no turn';
    case 90:
      return '90° clockwise';
    case 180:
      return 'half a turn';
    case 270:
      return '90° anticlockwise';
    default:
      return `${value}°`;
  }
}

/**
 * The settings, in one line, next to the button that acts on them.
 *
 * A tool whose options sit below the fold is a tool that appears to choose for
 * you — "it rotated 90 on its own" was exactly that. This line is always in
 * view, so the current choice is never a surprise.
 */
export function summariseOptions(tool: PdfTool, options: Record<string, string>): string {
  // The page range goes last: it is the least surprising part, and the choice
  // that changes the result should be the first thing in the line.
  const range: string[] = [];
  const parts: string[] = [];

  for (const option of tool.options) {
    if (option.kind === 'note' || option.kind === 'bookmarks') {
      continue;
    }

    const value = options[option.id] ?? '';

    switch (option.kind) {
      case 'range': {
        const text = value.trim();
        range.push(!text || text === 'all' || text === '*' ? 'all pages' : `pages ${text}`);
        break;
      }
      case 'choice': {
        const chosen = option.choices.find((choice) => choice.value === value) ?? option.choices[0];
        if (chosen) parts.push(chosen.label);
        break;
      }
      case 'text': {
        if (option.secure) parts.push(value.length > 0 ? 'password set' : 'no password');
        else if (value.trim().length > 0) parts.push(`“${value.trim().slice(0, 24)}”`);
        break;
      }
      case 'number': {
        parts.push(`${value || option.default}${option.suffix ?? ''}`);
        break;
      }
      case 'slider': {
        const numeric = Number(value);
        parts.push(option.format(Number.isFinite(numeric) && value !== '' ? numeric : option.default));
        break;
      }
      case 'toggle': {
        if (value === 'true') parts.push(option.label.toLowerCase());
        break;
      }
      case 'order': {
        const count = value.split(',').filter((part) => part.trim().length > 0).length;
        parts.push(count > 0 ? `${count} ${count === 1 ? 'page' : 'pages'} in order` : 'no order yet');
        break;
      }
      case 'rotation': {
        parts.push(describeRotation(value || option.default));
        break;
      }
      case 'signature': {
        parts.push(describePayload(parsePayload(value)));
        break;
      }
      case 'colour': {
        const chosen = option.swatches.find((swatch) => swatch.value === value) ?? option.swatches[0];
        if (chosen) parts.push(chosen.label);
        break;
      }
    }
  }

  return [...parts, ...range].slice(0, 3).join(' · ');
}

export function defaultsFor(tool: PdfTool): Record<string, string> {
  const values: Record<string, string> = {};

  for (const option of tool.options) {
    switch (option.kind) {
      case 'range':
      case 'choice':
      case 'text':
      case 'rotation':
      case 'colour':
        values[option.id] = option.default ?? '';
        break;
      case 'order':
      case 'bookmarks':
        // Built by the screen from what the person taps, not from the catalog.
        values[option.id] = '';
        break;
      case 'number':
      case 'slider':
        values[option.id] = String(option.default);
        break;
      case 'toggle':
        values[option.id] = option.default ? 'true' : 'false';
        break;
      case 'signature':
      case 'note':
        break;
    }
  }

  return values;
}
