/**
 * Regain's persisted state, as pure functions.
 *
 * Everything here is a value in, value out, so the rules that decide what is
 * blocked can be tested without rendering anything. The provider in
 * `RegainProvider.tsx` is a thin shell around these functions plus storage.
 *
 * Shape:
 *   enabled        master switch
 *   rules          appId -> ids of the sections that are blocked
 *   interventions  ISO date -> how many times a blocked screen was shown
 *
 * Rules are stored as an allow-list of *blocked* sections rather than of
 * allowed ones: an app that is not in the catalog yet — or a section added in a
 * later version — is available, never accidentally blocked.
 */

import { REGAIN_APPS, blockableSections, type RegainApp } from './catalog';

export const REGAIN_STORAGE_KEY = 'shaikhs.regain.v1';
export const REGAIN_VERSION = 1;

export type RegainState = {
  version: number;
  enabled: boolean;
  rules: Record<string, string[]>;
  /** Keyed by `YYYY-MM-DD` in the device's time zone. */
  interventions: Record<string, number>;
};

/** The rules a fresh install starts with: the default-blocked sections only. */
export function defaultRules(): Record<string, string[]> {
  const rules: Record<string, string[]> = {};

  for (const app of REGAIN_APPS) {
    const blocked = app.sections
      .filter((section) => section.blockable && section.defaultBlocked)
      .map((section) => section.id);

    if (blocked.length > 0) rules[app.id] = blocked;
  }

  return rules;
}

export function createDefaultState(): RegainState {
  return {
    version: REGAIN_VERSION,
    enabled: false,
    rules: defaultRules(),
    interventions: {},
  };
}

/** Local calendar day, not UTC: "today" should mean the day the person is in. */
export function dayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isCountRecord(value: unknown): value is Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((count) => typeof count === 'number' && Number.isFinite(count));
}

/**
 * Reads stored state, repairing anything malformed.
 *
 * A corrupt record must never lock someone out of their own settings, so every
 * field falls back to its default independently rather than rejecting the whole
 * object.
 */
export function parseState(raw: string | null | undefined): RegainState {
  const fallback = createDefaultState();
  if (!raw) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return fallback;

  const candidate = parsed as Partial<RegainState>;

  const rules: Record<string, string[]> = {};
  let rulesReadable = false;

  if (candidate.rules && typeof candidate.rules === 'object' && !Array.isArray(candidate.rules)) {
    rulesReadable = true;
    for (const [appId, sections] of Object.entries(candidate.rules)) {
      if (isStringArray(sections)) rules[appId] = sections;
    }
  }

  return {
    version: REGAIN_VERSION,
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : fallback.enabled,
    // An empty object is a real answer — "everything available" — and must
    // survive a restart. Only a missing or unusable record falls back to the
    // defaults; a garbage entry is dropped rather than blocking anything by
    // accident.
    rules: rulesReadable ? rules : fallback.rules,
    interventions: isCountRecord(candidate.interventions) ? candidate.interventions : {},
  };
}

export function serializeState(state: RegainState): string {
  return JSON.stringify(state);
}

/** Sections of `app` that are currently blocked. Unknown ids are ignored. */
export function blockedSectionsFor(state: RegainState, app: RegainApp): string[] {
  const blocked = new Set(state.rules[app.id] ?? []);
  return blockableSections(app)
    .filter((section) => blocked.has(section.id))
    .map((section) => section.id);
}

export function isSectionBlocked(
  state: RegainState,
  app: RegainApp,
  sectionId: string,
): boolean {
  const section = app.sections.find((candidate) => candidate.id === sectionId);
  if (!section?.blockable) return false;
  return (state.rules[app.id] ?? []).includes(sectionId);
}

/** True only when Regain is switched on *and* this exact surface is blocked. */
export function shouldBlock(
  state: RegainState,
  app: RegainApp,
  sectionId: string,
): boolean {
  return state.enabled && isSectionBlocked(state, app, sectionId);
}

export function toggleSection(
  state: RegainState,
  app: RegainApp,
  sectionId: string,
): RegainState {
  const section = app.sections.find((candidate) => candidate.id === sectionId);

  // "Always available" sections are not switchable, so this is a no-op rather
  // than an error: a stale UI tap should not crash anything.
  if (!section?.blockable) return state;

  const current = new Set(state.rules[app.id] ?? []);
  if (current.has(sectionId)) current.delete(sectionId);
  else current.add(sectionId);

  const rules = { ...state.rules };

  if (current.size === 0) delete rules[app.id];
  else rules[app.id] = blockableSections(app)
    .map((candidate) => candidate.id)
    .filter((id) => current.has(id));

  return { ...state, rules };
}

export function setEnabled(state: RegainState, enabled: boolean): RegainState {
  return { ...state, enabled };
}

/** Apps that have at least one blocked section. */
export function activeApps(state: RegainState): RegainApp[] {
  return REGAIN_APPS.filter((app) => blockedSectionsFor(state, app).length > 0);
}

export function totalBlockedSections(state: RegainState): number {
  return REGAIN_APPS.reduce((total, app) => total + blockedSectionsFor(state, app).length, 0);
}

export function interventionsToday(state: RegainState, date: Date = new Date()): number {
  return state.interventions[dayKey(date)] ?? 0;
}

/**
 * Counts one blocked encounter.
 *
 * Kept per day rather than as a running total so the number can honestly be
 * described as "today" — a lifetime counter would only ever grow.
 */
export function recordIntervention(
  state: RegainState,
  date: Date = new Date(),
): RegainState {
  const key = dayKey(date);
  const interventions = { ...state.interventions };

  // Keep a week of history: enough for a streak or a small chart later, without
  // the record growing forever.
  const keys = Object.keys(interventions).sort();
  if (keys.length > 30) {
    for (const old of keys.slice(0, keys.length - 30)) delete interventions[old];
  }

  interventions[key] = (interventions[key] ?? 0) + 1;
  return { ...state, interventions };
}

/** The last `days` days of counts, oldest first. Missing days read as zero. */
export function recentInterventions(
  state: RegainState,
  days: number,
  now: Date = new Date(),
): { day: string; count: number }[] {
  const result: { day: string; count: number }[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - offset);
    const key = dayKey(date);
    result.push({ day: key, count: state.interventions[key] ?? 0 });
  }

  return result;
}
