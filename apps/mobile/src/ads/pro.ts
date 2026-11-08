/**
 * Which tools are free, which wait for an unlock — derived, never typed twice.
 *
 * The catalogue is the list of tools; this file only reads one flag from it.
 * That way a tool can never be "in the catalogue" and forgotten by the gate, or
 * gated and missing from the catalogue: there is one answer to "what is Pro".
 */

import { PDF_TOOLS, type PdfToolId } from '@/pdf/catalog';

/** The paid set: occasional-use tools, not the ones that finish a document. */
export const PRO_TOOL_IDS: ReadonlySet<PdfToolId> = new Set(
  PDF_TOOLS.filter((tool) => tool.pro).map((tool) => tool.id),
);

/** Everything anyone can use without watching anything. */
export const FREE_TOOL_IDS: readonly PdfToolId[] = PDF_TOOLS.filter((tool) => !tool.pro).map(
  (tool) => tool.id,
);

export function isProTool(id: string): boolean {
  return PRO_TOOL_IDS.has(id as PdfToolId);
}

/** "11 tools", for the card's copy. */
export function proToolCount(): number {
  return PRO_TOOL_IDS.size;
}

/**
 * The rule the split is supposed to obey, checked by a test:
 * every "finish the document" tool must be free. If a future edit marks Merge
 * or Sign as Pro, the test fails and the argument has to happen here rather
 * than by accident.
 */
export const MUST_STAY_FREE: readonly PdfToolId[] = [
  'merge',
  'split',
  'delete',
  'rearrange',
  'rotate',
  'sign',
  'compress',
  'pdf2text',
];
