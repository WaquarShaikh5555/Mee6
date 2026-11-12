/**
 * Pro granted by the owner, remembered for the session.
 *
 * The 48-hour window from watching an ad lives on the phone. Pro granted from
 * the owner console is different: it is server truth, it can be taken back, and
 * it must be read after sign-in rather than stored in a file. Keeping it in a
 * module-level value means the catalogue, the tool gate and the unlock card all
 * agree without threading another provider through the tree.
 *
 * The value is replaced wholesale on every sign-in, refresh and sign-out, so a
 * revoked grant cannot outlive the session that carried it.
 */

let proUntilMs: number | null = null;

/** Parses the server's ISO timestamp; invalid values mean "no grant". */
export function setServerProUntil(iso: string | null | undefined): void {
  if (!iso) {
    proUntilMs = null;
    return;
  }

  const parsed = Date.parse(iso);
  proUntilMs = Number.isFinite(parsed) ? parsed : null;
}

/** True while an owner-granted Pro window is open. */
export function serverProActive(now = Date.now()): boolean {
  return proUntilMs !== null && proUntilMs > now;
}

/** The raw timestamp, for "until 12 November" copy. */
export function serverProUntil(): number | null {
  return proUntilMs;
}
