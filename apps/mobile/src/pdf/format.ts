/** Small, shared formatting for the PDF screens. */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  // One decimal below 10, none above: "1.4 MB" is useful, "12.7 MB" is noise.
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** "-38%" and a direction, for the compress result. */
export function formatSaving(before: number, after: number): string | null {
  if (before <= 0 || after >= before) return null;
  const saved = Math.round(((before - after) / before) * 100);
  return saved > 0 ? `${saved}% smaller` : null;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}

/** Strips a directory and a trailing extension: "a/b/Notes.pdf" → "Notes". */
export function baseName(nameOrUri: string): string {
  const withoutQuery = nameOrUri.split('?')[0] ?? nameOrUri;
  const file = decodeURIComponent(withoutQuery.split('/').pop() ?? withoutQuery);
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : file;
}

/**
 * The name a result is given, derived from the tool and the input.
 * Kept here so the engine and the UI agree without trading strings.
 */
export function outputNameFor(inputName: string, suffix: string, extension: string): string {
  const base = baseName(inputName) || 'document';
  return `${base}${suffix}.${extension}`;
}

/** A clock, for the "took 1.4s" line. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/** The type the system share sheet needs, from the name the engine wrote. */
export function mimeFor(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  switch (extension) {
    case 'zip':
      return 'application/zip';
    case 'txt':
      return 'text/plain';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      return 'application/pdf';
  }
}
