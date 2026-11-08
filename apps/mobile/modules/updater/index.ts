/**
 * TypeScript face of the updater (Android only).
 *
 * The app resolves this through `src/update/updater.ts` with
 * `requireOptionalNativeModule('Updater')`, so the same bundle still runs in the
 * web preview and in Expo Go, where there is nothing to install.
 */

import { requireNativeModule } from 'expo-modules-core';

const Updater = requireNativeModule('Updater');

export default Updater;
