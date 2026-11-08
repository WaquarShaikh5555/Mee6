/**
 * Key–value storage for the app.
 *
 * Native: expo-secure-store, so session tokens and preferences live in the iOS
 * Keychain / Android Keystore rather than plain files.
 * Web: localStorage (see storage.web.ts) — acceptable for the preview build only;
 * deployment should keep tokens in httpOnly cookies.
 */

import * as SecureStore from 'expo-secure-store';

export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Storage failures must never crash a screen; the session simply re-auths.
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore.
    }
  },
};
