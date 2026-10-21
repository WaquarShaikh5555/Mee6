/**
 * Supabase client, configured once for the whole app.
 *
 * Supabase provides the database (PostgreSQL), the account system (email +
 * password, password reset, sessions), and row-level security policies that
 * decide who may read or write each row. There is no server of ours to deploy:
 * the app talks to Supabase over HTTPS with a publishable key, which is safe to
 * ship inside the app because every table is protected by those policies.
 *
 * Configuration comes from two environment variables, inlined at build time:
 *
 *   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable / anon key>
 *
 * With them set, the app uses real accounts. Without them it falls back to the
 * on-device demo service, so screens stay usable before the project exists.
 */

// React Native's built-in URL implementation is incomplete; the Supabase SDK
// relies on the full WHATWG behaviour. Must be imported before the SDK.
import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { storage } from '@/lib/storage';

export function supabaseUrl(): string {
  return (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
}

export function supabaseAnonKey(): string {
  return (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
}

/** True when both values are present, i.e. the app should use real accounts. */
export function isSupabaseConfigured(): boolean {
  return supabaseUrl().length > 0 && supabaseAnonKey().length > 0;
}

/**
 * expo-secure-store behind the interface the Supabase SDK expects.
 *
 * Tokens therefore live in the iOS Keychain / Android Keystore, not in a plain
 * file. The SDK refreshes them in the background and persists the result here.
 */
const secureStorageAdapter = {
  getItem: (key: string): Promise<string | null> => storage.get(key),
  setItem: (key: string, value: string): Promise<void> => storage.set(key, value),
  removeItem: (key: string): Promise<void> => storage.remove(key),
};

let client: SupabaseClient | null = null;

/** Lazily created so importing this module in a test or the demo build costs nothing. */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = supabaseUrl();
  const key = supabaseAnonKey();

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  client = createClient(url, key, {
    auth: {
      storage: secureStorageAdapter,
      persistSession: true,
      autoRefreshToken: true,
      // A native app has no address bar for the SDK to read a session out of.
      detectSessionInUrl: false,
    },
  });

  return client;
}

/** Test seam: drops the cached client so a new configuration is picked up. */
export function resetSupabaseClient(): void {
  client = null;
}
