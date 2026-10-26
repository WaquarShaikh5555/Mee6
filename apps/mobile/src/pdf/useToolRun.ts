/**
 * Running a tool, and getting the result off the phone.
 *
 * The engine writes a file; this hook tracks the run and hands back everything
 * the result card needs. Sharing goes through the system sheet, so nothing here
 * knows where the file ends up — the person chooses.
 */

import * as Sharing from 'expo-sharing';
import { useCallback, useRef, useState } from 'react';

import { PdfError, process as runTool, type PdfResult, type ProcessRequest } from './engine';

export type RunState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: PdfResult; tookMs: number; request: ProcessRequest }
  | { status: 'error'; error: PdfError };

const IDLE: RunState = { status: 'idle' };

export function useToolRun() {
  const [state, setState] = useState<RunState>(IDLE);
  const running = useRef(false);

  const run = useCallback(async (request: ProcessRequest) => {
    if (running.current) return;
    running.current = true;
    setState({ status: 'running' });

    const started = Date.now();

    try {
      const result = await runTool(request);
      setState({ status: 'done', result, tookMs: Date.now() - started, request });
    } catch (error) {
      const pdfError =
        error instanceof PdfError
          ? error
          : new PdfError('unknown', 'Something went wrong while processing the file.');
      setState({ status: 'error', error: pdfError });
    } finally {
      running.current = false;
    }
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return { state, run, reset };
}

export async function shareFile(uri: string, name: string, mimeType: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;

  await Sharing.shareAsync(uri, {
    mimeType,
    dialogTitle: name,
    UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
  });

  return true;
}

