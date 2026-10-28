/**
 * The native updater, as the app sees it.
 *
 * Optional on purpose: the web preview and Expo Go have no installer, and the
 * update prompt simply does not exist there rather than failing at runtime.
 */

type Downloaded = { uri: string; bytes: number; sha256: string };
type Progress = { received: number; total: number };

type UpdaterNativeModule = {
  /** `expected` is the feed's SHA-256; empty means "do not check". */
  download(url: string, name: string, expected: string): Promise<Downloaded>;
  /** False when "install unknown apps" has not been allowed for this app yet. */
  install(uri: string): Promise<boolean>;
  canInstall(): Promise<boolean>;
  openInstallSettings(): void;
  discard(uri: string): Promise<boolean>;
  addListener(event: 'onProgress', listener: (payload: Progress) => void): { remove(): void };
};

function nativeModule(): UpdaterNativeModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-modules-core').requireOptionalNativeModule?.('Updater');
    return (mod as UpdaterNativeModule | null) ?? null;
  } catch {
    return null;
  }
}

/** False in the browser and in Expo Go. */
export function isUpdaterAvailable(): boolean {
  return nativeModule() !== null;
}

/**
 * Downloads an APK, reporting progress as it goes.
 *
 * The listener is removed in a `finally`, so a failed download cannot leave a
 * callback firing into a screen that has moved on.
 */
export async function downloadUpdate(
  url: string,
  name: string,
  sha256: string,
  onProgress: (fraction: number, received: number, total: number) => void,
): Promise<Downloaded> {
  const updater = nativeModule();
  if (!updater) throw new Error('unavailable');

  const subscription = updater.addListener('onProgress', ({ received, total }) => {
    onProgress(total > 0 ? received / total : 0, received, total);
  });

  try {
    return await updater.download(url, name, sha256);
  } finally {
    subscription.remove();
  }
}

/**
 * True when the install actually started.
 *
 * `false` is not a failure: it means Android wants the one-time permission
 * first, and the screen offers it.
 */
export async function installUpdate(uri: string): Promise<boolean> {
  const updater = nativeModule();
  if (!updater) throw new Error('unavailable');
  return updater.install(uri);
}

export async function canInstall(): Promise<boolean> {
  const updater = nativeModule();
  if (!updater) return false;

  try {
    return await updater.canInstall();
  } catch {
    return false;
  }
}

export function openInstallSettings(): void {
  nativeModule()?.openInstallSettings();
}

export async function discardDownload(uri: string): Promise<void> {
  try {
    await nativeModule()?.discard(uri);
  } catch {
    // The cache is the system's to reclaim.
  }
}
