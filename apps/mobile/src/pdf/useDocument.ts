/**
 * One picked document, as the tool screens need it.
 *
 * Pros: the page count that every range field validates against, whether a
 * password is needed, and the password itself once it is known. The password
 * lives in component state only — never in storage, never in a log.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { PickedFile } from './documents';
import { PdfError, probe, type PdfProbe } from './engine';

export type DocumentState = {
  file: PickedFile | null;
  probe: PdfProbe | null;
  /** The password currently being tried, once the person has typed one. */
  password: string;
  needsPassword: boolean;
  wrongPassword: boolean;
  /** A message worth showing under the file, e.g. "this file is damaged". */
  error: string | null;
  loading: boolean;
  pageCount: number;
};

const EMPTY: DocumentState = {
  file: null,
  probe: null,
  password: '',
  needsPassword: false,
  wrongPassword: false,
  error: null,
  loading: false,
  pageCount: 0,
};

export function usePdfDocument(file: PickedFile | null) {
  const [state, setState] = useState<DocumentState>(EMPTY);
  const attempt = useRef(0);

  const inspect = useCallback(async (target: PickedFile, password: string) => {
    attempt.current += 1;
    const mine = attempt.current;

    setState((current) => ({
      ...current,
      file: target,
      loading: true,
      error: null,
    }));

    try {
      const result = await probe(target.uri, password || undefined);
      if (attempt.current !== mine) return;

      if (result.needsPassword) {
        setState((current) => ({
          ...current,
          file: target,
          probe: null,
          password,
          loading: false,
          needsPassword: true,
          // A password was tried and the engine still wants one: it was wrong.
          wrongPassword: password.length > 0,
          pageCount: 0,
        }));
        return;
      }

      setState({
        file: target,
        probe: result,
        password,
        needsPassword: false,
        wrongPassword: false,
        error: null,
        loading: false,
        pageCount: result.pages,
      });
    } catch (error) {
      if (attempt.current !== mine) return;

      const pdfError = error instanceof PdfError ? error : null;
      setState({
        file: target,
        probe: null,
        password,
        needsPassword: false,
        wrongPassword: false,
        error: pdfError?.message ?? 'This file could not be read.',
        loading: false,
        pageCount: 0,
      });
    }
  }, []);

  useEffect(() => {
    if (!file) {
      attempt.current += 1;
      setState(EMPTY);
      return;
    }

    void inspect(file, '');
    // Only the identity of the file should trigger a fresh probe; a password is
    // submitted explicitly so typos do not fire a request per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.uri]);

  const submitPassword = useCallback(
    (password: string) => {
      if (!file) return;
      void inspect(file, password);
    },
    [file, inspect],
  );

  const clearPassword = useCallback(() => {
    setState((current) => ({
      ...current,
      password: '',
      needsPassword: true,
      wrongPassword: false,
    }));
  }, []);

  return { ...state, submitPassword, clearPassword };
}
