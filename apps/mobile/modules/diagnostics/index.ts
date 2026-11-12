/**
 * Diagnostics (Android only).
 *
 * There is nothing to call from JavaScript today: the useful part is a
 * ContentProvider that runs before anything else and, if the app dies, writes
 * the reason to the phone's Downloads folder. This file exists so the module
 * has a typed entry point if a screen ever needs to read it.
 */

import { requireNativeModule } from 'expo-modules-core';

export default requireNativeModule('Diagnostics');
