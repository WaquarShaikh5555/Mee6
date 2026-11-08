/**
 * Web storage adapter. Metro resolves `.web.ts` before `.ts`, so the browser
 * preview never pulls in a native Keychain module.
 *
 * Preview only: localStorage is readable by any script on the origin. A real
 * web deployment should move the session to an httpOnly, SameSite cookie set by
 * the auth service.
 */

export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Ignore (private mode, quota).
    }
  },
  async remove(key: string): Promise<void> {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Ignore.
    }
  },
};
