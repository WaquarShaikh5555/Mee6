/**
 * Versions, and how a phone learns that it is behind.
 *
 * The feed is a small JSON file published beside the APK by the build, so the
 * check is one plain download with no API quota, no token and no dependency on
 * GitHub's rate limits. If the file is missing or unreadable the answer is
 * simply "no update" — a broken feed must never stop the app from opening.
 */

import Constants from 'expo-constants';

export const UPDATE_FEED =
  'https://github.com/WaquarShaikh5555/Mee6/releases/download/apk/version.json';

/** How long the Update button stays disabled, so the message is actually read. */
export const READ_SECONDS = 5;

export type UpdateInfo = {
  /** The version the build published, e.g. "0.9.0". */
  version: string;
  /** Where the APK is. */
  url: string;
  /** Bytes, so the prompt can say how big the download is. */
  size: number;
  /** Two or three short lines: what changed. */
  notes: string[];
};

/** What is installed right now. */
export function installedVersion(): string {
  const fromConfig = Constants.expoConfig?.version;
  if (typeof fromConfig === 'string' && fromConfig.length > 0) return fromConfig;

  // Older builds expose it here; the two agree in practice.
  const native = (Constants as unknown as { nativeAppVersion?: string }).nativeAppVersion;
  return typeof native === 'string' && native.length > 0 ? native : '0.0.0';
}

/**
 * Orders two dotted versions.
 *
 * Numeric segments only: "1.10.0" is newer than "1.9.9", which string
 * comparison gets wrong. A suffix ("1.2.0-beta.1") is ignored — everything
 * published here is a release.
 */
export function compareVersions(left: string, right: string): number {
  const parts = (value: string): number[] =>
    value
      .split('.')
      .map((segment) => Number.parseInt(segment, 10))
      .map((number) => (Number.isFinite(number) ? number : 0));

  const a = parts(left);
  const b = parts(right);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }

  return 0;
}

/** True only when the feed is strictly newer than what is installed. */
export function isNewer(remote: string, installed: string): boolean {
  return compareVersions(remote, installed) > 0;
}

/**
 * Reads the feed.
 *
 * Tolerant by design: a field that is missing or the wrong type becomes a
 * sensible default, and anything that is not a usable link returns null, which
 * the app reads as "nothing to offer".
 */
export function parseFeed(raw: unknown): UpdateInfo | null {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  const version = typeof record.version === 'string' ? record.version.trim() : '';
  const url = typeof record.url === 'string' ? record.url.trim() : '';

  if (version.length === 0 || !/^https:\/\//i.test(url)) return null;

  const size = typeof record.size === 'number' && record.size > 0 ? record.size : 0;

  const notes = Array.isArray(record.notes)
    ? record.notes
        .filter((note): note is string => typeof note === 'string')
        .map((note) => note.trim())
        .filter((note) => note.length > 0)
        .slice(0, 4)
    : [];

  return { version, url, size, notes };
}

/** Bytes to a short, human phrase. Kept beside the feed because only it uses it. */
export function sizeFor(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
