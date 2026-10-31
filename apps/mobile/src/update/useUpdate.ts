import { useCallback, useEffect, useRef, useState } from 'react';

import {
  canInstall,
  cpuAbi,
  discardDownload,
  downloadUpdate,
  installUpdate,
  isUpdaterAvailable,
  openInstallSettings,
} from './updater';
import { getEnforcementStatus } from '@/focus/enforcement';

import {
  UPDATE_FEED,
  installedVersion,
  isNewer,
  packageFor,
  parseFeed,
  type Edition,
  type UpdateInfo,
  type UpdatePackage,
} from './version';

/**
 * Checking, downloading, installing.
 *
 * One hook, four states, and every transition reversible except the last: an
 * update that has been handed to Android cannot be taken back, so the UI stops
 * offering choices once `install` has started.
 */

export type UpdatePhase =
  | { status: 'idle' }
  /** Asked, waiting for the feed. Never shown. */
  | { status: 'checking' }
  | { status: 'available'; info: UpdateInfo; installed: string; pkg: UpdatePackage }
  | { status: 'downloading'; info: UpdateInfo; progress: number; received: number; total: number }
  /** Android wants its one-time permission before it will install anything. */
  | { status: 'permission'; info: UpdateInfo; download: string }
  | { status: 'installing'; info: UpdateInfo }
  | { status: 'failed'; info: UpdateInfo; message: string };

const FEED_TIMEOUT_MS = 8_000;

/**
 * Full or lite, asked once per check.
 *
 * The lite build has no accessibility service, and Focus Mode says exactly that.
 * Anything else — including a module that cannot answer — is treated as the
 * full build, which is the edition that has always been published.
 */
async function editionOf(): Promise<Edition> {
  try {
    const status = await getEnforcementStatus();
    return status.availability === 'not-in-this-build' ? 'lite' : 'full';
  } catch {
    return 'full';
  }
}

export function useUpdate() {
  const [phase, setPhase] = useState<UpdatePhase>({ status: 'idle' });
  const [dismissed, setDismissed] = useState(false);
  const busy = useRef(false);
  const download = useRef<string | null>(null);
  /** Chosen at check time; re-deriving it later could pick another edition. */
  const chosen = useRef<UpdatePackage | null>(null);

  const check = useCallback(async () => {
    if (!isUpdaterAvailable()) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

    try {
      const response = await fetch(UPDATE_FEED, {
        signal: controller.signal,
        // The feed is a tiny file that changes with every build; any cache at
        // all would hide an update for a day.
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!response.ok) return;

      const info = parseFeed(await response.json());
      if (!info) return;

      const installed = installedVersion();
      if (!isNewer(info.version, installed)) return;

      // The small build for this phone *and this edition*, decided once and
      // carried through the whole flow so the size shown is the size
      // downloaded. A lite build with no lite package for its CPU gets no
      // offer rather than a quiet change of edition.
      const pkg = packageFor(info, cpuAbi(), await editionOf());
      if (!pkg) return;

      chosen.current = pkg;
      setPhase({ status: 'available', info, installed, pkg });
    } catch {
      // Offline, or the feed is not there yet: nothing to say, nothing to break.
    } finally {
      clearTimeout(timer);
    }
  }, []);

  /** The update flow proper. Re-entrant taps are ignored. */
  const start = useCallback(async () => {
    if (busy.current) return;
    const current = phase;
    if (current.status !== 'available' && current.status !== 'failed' && current.status !== 'permission') {
      return;
    }

    busy.current = true;
    const info = current.info;

    try {
      // Already downloaded once (the permission detour): go straight back to it.
      if (download.current) {
        await handOver(info);
        return;
      }

      const pkg = current.status === 'available' ? current.pkg : chosen.current;
      if (!pkg) return;

      setPhase({ status: 'downloading', info, progress: 0, received: 0, total: pkg.size });

      const file = await downloadUpdate(
        pkg.url,
        `shaikhs-${info.version}.apk`,
        pkg.sha256,
        (fraction, received, total) => {
          setPhase({ status: 'downloading', info, progress: fraction, received, total });
        },
      );

      download.current = file.uri;
      await handOver(info);
    } catch (error) {
      setPhase({
        status: 'failed',
        info,
        message:
          error instanceof Error && error.message && error.message !== 'unavailable'
            ? error.message
            : 'The update could not be downloaded. Check the connection and try again.',
      });
    } finally {
      busy.current = false;
    }
  }, [phase]);

  /** Passes the downloaded APK to Android, or asks for the permission first. */
  async function handOver(info: UpdateInfo) {
    const file = download.current;
    if (!file) return;

    if (!(await canInstall())) {
      setPhase({ status: 'permission', info, download: file });
      return;
    }

    setPhase({ status: 'installing', info });

    const started = await installUpdate(file);

    if (!started) {
      setPhase({ status: 'permission', info, download: file });
    }
  }

  /** The one-time "allow installs from Shaikh's" step. */
  const grant = useCallback(() => {
    openInstallSettings();
  }, []);

  /** On returning from settings, carry on if the permission is now granted. */
  const refreshPermission = useCallback(async () => {
    if (phase.status !== 'permission') return;

    if (await canInstall()) {
      await start();
    }
  }, [phase, start]);

  const later = useCallback(() => {
    setDismissed(true);

    // A download that was never installed is 63 MB of nothing.
    if (download.current) {
      void discardDownload(download.current);
      download.current = null;
    }
  }, []);

  // Nothing to do once it is dismissed.
  useEffect(() => {
    if (dismissed && phase.status !== 'idle') setPhase({ status: 'idle' });
  }, [dismissed, phase.status]);

  return {
    /** Check once, quietly, a moment after the app is up. */
    check,
    phase,
    dismissed,
    start,
    later,
    grant,
    refreshPermission,
    /** True while something is happening that should stop a second tap. */
    busy: busy.current,
  };
}
