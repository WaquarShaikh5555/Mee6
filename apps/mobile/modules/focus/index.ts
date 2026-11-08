/**
 * TypeScript face of the Focus Mode native module (Android only).
 *
 * The app does not import this file directly: `src/focus/enforcement.ts`
 * resolves the module at runtime with `requireOptionalNativeModule('Focus')`,
 * so the same bundle still runs in the web preview and in Expo Go. This file
 * exists so the native surface is typed and readable in one place.
 */

import { requireNativeModule } from 'expo-modules-core';

import type { FocusNativeModule } from '../../src/focus/enforcement';

const Focus = requireNativeModule('Focus') as FocusNativeModule;

export default Focus;
