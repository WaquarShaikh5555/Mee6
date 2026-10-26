/**
 * TypeScript face of the PDF engine (Android only).
 *
 * The app resolves this at runtime through `src/pdf/engine.ts` with
 * `requireOptionalNativeModule('PdfArena')`, so the same bundle still runs in
 * the web preview. This file exists so the native surface is written down once.
 */

import { requireNativeModule } from 'expo-modules-core';

const PdfArena = requireNativeModule('PdfArena');

export default PdfArena;
