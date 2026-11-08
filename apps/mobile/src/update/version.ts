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

/** One downloadable build: where, how big, and what it should hash to. */
export type UpdatePackage = {
  url: string;
  size: number;
  sha256: string;
};

export type UpdateInfo = {
  /** The version the build published, e.g. "0.9.0". */
  version: string;
  /** Where the APK is. */
  url: string;
  /** Bytes, so the prompt can say how big the download is. */
  size: number;
  /**
   * The SHA-256 of the APK, checked after it lands.
   *
   * A partial download is the one way an update can arrive looking fine and
   * still be refused by Android as "invalid". Empty means the feed did not
   * publish one (older feeds), and the download goes unverified.
   */
  sha256: string;
  /**
   * The same release built for one CPU type, keyed by Android's ABI name.
   *
   * A 64-bit package is close to half the size of the universal one, and the
   * download is the fragile part of any update on a phone. Empty when the feed
   * publishes only the universal package.
   */
  packages: Record<string, UpdatePackage>;
  /** Two or three short lines: what changed. */
  notes: string[];
};

/** Reads one package entry, or null if it is not a usable https link. */
function parsePackage(raw: unknown): UpdatePackage | null {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  const url = typeof record.url === 'string' ? record.url.trim() : '';
  if (!/^https:\/\//i.test(url)) return null;

  const size = typeof record.size === 'number' && record.size > 0 ? record.size : 0;
  const digest = typeof record.sha256 === 'string' ? record.sha256.trim().toLowerCase() : '';

  return { url, size, sha256: /^[0-9a-f]{64}$/.test(digest) ? digest : '' };
}

/**
 * Which edition this build is.
 *
 * The lite edition has no accessibility service, so Focus Mode reports it is not in
 * this build — that is the one cheap, local fact that tells the two apart. It
 * matters for updates: a lite install must never be handed the full package,
 * because that would quietly give someone Focus Mode they did not ask for.
 */
export type Edition = 'full' | 'lite';

/**
 * The smallest package built for this phone.
 *
 * `abi` is what Android reports (`arm64-v8a`, `armeabi-v7a`, `x86_64`…). A full
 * build falls back to the universal package — the one that runs everywhere. A
 * lite build only takes a lite package: no entry means no update, which is
 * better than silently changing what is installed.
 */
export function packageFor(
  info: UpdateInfo,
  abi: string | null,
  edition: Edition = 'full',
): UpdatePackage | null {
  const universal: UpdatePackage = { url: info.url, size: info.size, sha256: info.sha256 };

  if (!abi) return edition === 'lite' ? null : universal;

  const name = abi.trim().toLowerCase();
  const cpu = name.startsWith('arm64') ? 'arm64-v8a' : name.startsWith('arm') ? 'armeabi-v7a' : '';

  if (!cpu) return edition === 'lite' ? null : universal;

  if (edition === 'lite') return info.packages[`${cpu}-lite`] ?? null;

  return info.packages[cpu] ?? universal;
}

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

  const digest = typeof record.sha256 === 'string' ? record.sha256.trim().toLowerCase() : '';
  const sha256 = /^[0-9a-f]{64}$/.test(digest) ? digest : '';

  const packages: Record<string, UpdatePackage> = {};
  if (record.packages && typeof record.packages === 'object') {
    for (const [key, value] of Object.entries(record.packages as Record<string, unknown>)) {
      const parsed = parsePackage(value);
      if (parsed) packages[key] = parsed;
    }
  }

  const notes = Array.isArray(record.notes)
    ? record.notes
        .filter((note): note is string => typeof note === 'string')
        .map((note) => note.trim())
        .filter((note) => note.length > 0)
        .slice(0, 4)
    : [];

  return { version, url, size, sha256, packages, notes };
}

/** Bytes to a short, human phrase. Kept beside the feed because only it uses it. */
export function sizeFor(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
