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
};

export const CATEGORIES: { id: PdfCategory; blurb: string }[] = [
  { id: 'Edit', blurb: 'Pages, marks and structure' },
  { id: 'Optimise', blurb: 'Smaller, cleaner, checked' },
  { id: 'Secure', blurb: 'Locked, unlocked, described' },
  { id: 'Convert', blurb: 'Out of the PDF, or into one' },
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
      'Extract the pages you name into a new file — or make one file per page and get them back as a ZIP.',
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
      { ...pagesAll, label: 'Pages to remove', hint: 'Everything else is kept.' } as ToolOption,
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
      pagesAll,
      {
        kind: 'choice',
        id: 'angle',
        label: 'Turn',
        default: '90',
        choices: [
          { value: '90', label: '90° right' },
          { value: '180', label: '180°' },
          { value: '270', label: '90° left' },
        ],
      },
    ],
    output: { extension: 'pdf', suffix: '-rotated' },
  },
  {
    id: 'sign',
    name: 'Sign',
    tagline: 'Add your signature',
    detail:
      'Draw a signature once and it is kept on this phone for next time. It is placed on top of the page, not over the text underneath.',
    category: 'Edit',
    icon: 'pencil-outline',
    input: 'pdf',
    options: [
      { kind: 'signature', id: 'signature', label: 'Signature' },
      { ...pagesAll, label: 'Pages to sign', hint: 'The same signature on each page you name.' },
      {
        kind: 'choice',
        id: 'corner',
        label: 'Placement',
        default: 'bottom-right',
        choices: [
          { value: 'bottom-right', label: 'Bottom right' },
          { value: 'bottom-left', label: 'Bottom left' },
          { value: 'top-right', label: 'Top right' },
          { value: 'top-left', label: 'Top left' },
        ],
      },
      {
        kind: 'slider',
        id: 'width',
        label: 'Size',
        min: 10,
        max: 45,
        step: 1,
        default: 24,
        format: (value) => `${value}% of the page width`,
      },
    ],
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
export function defaultsFor(tool: PdfTool): Record<string, string> {
  const values: Record<string, string> = {};

  for (const option of tool.options) {
    switch (option.kind) {
      case 'range':
      case 'choice':
      case 'text':
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
