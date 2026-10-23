/**
 * TypeScript face of the Regain native module (Android only).
 *
 * The app does not import this file directly: `src/regain/enforcement.ts`
 * resolves the module at runtime with `requireOptionalNativeModule('Regain')`,
 * so the same bundle still runs in the web preview and in Expo Go. This file
 * exists so the native surface is typed and readable in one place.
 */

import { requireNativeModule } from 'expo-modules-core';

import type { RegainNativeModule } from '../../src/regain/enforcement';

const Regain = requireNativeModule('Regain') as RegainNativeModule;

export default Regain;
