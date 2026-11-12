/**
 * The owner console, as the app sees it.
 *
 * Every call here is a `security definer` function in Postgres that re-checks
 * `is_admin` against the database before it does anything. This module is the
 * polite half of the contract: it maps rows to the app's shape and turns the
 * database's refusal codes into sentences a person can act on. If it is wrong,
 * the worst that happens is a failed request — never a granted permission.
 */

import { getSupabaseClient, isSupabaseConfigured } from '@/auth/supabaseClient';

export type AdminUser = {
  id: string;
  displayName: string;
  email: string | null;
  isAdmin: boolean;
  isBlocked: boolean;
  /** ISO timestamp, or null when Pro was never granted server-side. */
  proUntil: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  note: string | null;
};

export type AdminOverview = {
  total: number;
  pro: number;
  blocked: number;
  admins: number;
  seen7d: number;
};

export type AdminAction =
  | 'grant_pro'
  | 'revoke_pro'
  | 'block'
  | 'unblock'
  | 'make_admin'
  | 'remove_admin';

export type AuditEntry = {
  id: number;
  createdAt: string;
  action: string;
  actorEmail: string | null;
  targetEmail: string | null;
};

type RawUser = {
  id: string;
  display_name: string;
  email: string | null;
  is_admin: boolean;
  is_blocked: boolean;
  pro_until: string | null;
  last_seen_at: string | null;
  created_at: string;
  note: string | null;
};

export class AdminError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AdminError';
    this.code = code;
  }
}

/**
 * Postgres raises our own codes as plain messages; the SQLSTATE arrives in the
 * error's `code` field but the sentence is what we match on, because that is
 * stable across PostgREST versions.
 */
function toAdminError(error: unknown): AdminError {
  const raw = error as { message?: string; code?: string } | null;
  const message = raw?.message ?? '';

  if (/not_authorised/i.test(message)) {
    return new AdminError(
      'not-authorised',
      'This account is not an owner. Nothing was changed.',
    );
  }
  if (/last_admin/i.test(message)) {
    return new AdminError(
      'last-admin',
      'That is the only owner. Make somebody else an owner first.',
    );
  }
  if (/not_on_yourself/i.test(message)) {
    return new AdminError(
      'self',
      'You cannot pause or demote your own account. Ask another owner.',
    );
  }
  if (/no_such_account/i.test(message)) {
    return new AdminError('missing', 'That account no longer exists.');
  }
  if (/network|fetch|failed to fetch|timeout/i.test(message)) {
    return new AdminError('network', 'Cannot reach the server. Check your connection.');
  }

  return new AdminError('unknown', message || 'The server refused that change.');
}

function toUser(row: RawUser): AdminUser {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    isAdmin: row.is_admin === true,
    isBlocked: row.is_blocked === true,
    proUntil: row.pro_until,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    note: row.note,
  };
}

/** False in the web preview and demo builds: the console needs real accounts. */
export function adminAvailable(): boolean {
  return isSupabaseConfigured();
}

export async function listUsers(query: string, limit = 200): Promise<AdminUser[]> {
  if (!adminAvailable()) return [];

  const { data, error } = await getSupabaseClient().rpc('admin_list_users', {
    p_query: query.trim().length > 0 ? query.trim() : null,
    p_limit: limit,
  });

  if (error) throw toAdminError(error);
  return ((data ?? []) as RawUser[]).map(toUser);
}

export async function fetchOverview(): Promise<AdminOverview | null> {
  if (!adminAvailable()) return null;

  const { data, error } = await getSupabaseClient().rpc('admin_overview');
  if (error) throw toAdminError(error);

  const raw = (data ?? {}) as Partial<Record<'total' | 'pro' | 'blocked' | 'admins' | 'seen_7d', number>>;

  return {
    total: Number(raw.total ?? 0),
    pro: Number(raw.pro ?? 0),
    blocked: Number(raw.blocked ?? 0),
    admins: Number(raw.admins ?? 0),
    seen7d: Number(raw.seen_7d ?? 0),
  };
}

export async function setAccess(
  targetId: string,
  action: AdminAction,
  days = 30,
): Promise<AdminUser> {
  const { data, error } = await getSupabaseClient().rpc('admin_set_access', {
    p_target: targetId,
    p_action: action,
    p_days: days,
  });

  if (error) throw toAdminError(error);
  return toUser(data as RawUser);
}

export async function recentActions(limit = 12): Promise<AuditEntry[]> {
  if (!adminAvailable()) return [];

  const { data, error } = await getSupabaseClient().rpc('admin_recent_actions', {
    p_limit: limit,
  });

  if (error) throw toAdminError(error);

  return ((data ?? []) as {
    id: number;
    created_at: string;
    action: string;
    actor_email: string | null;
    target_email: string | null;
  }[]).map((row) => ({
    id: Number(row.id),
    createdAt: row.created_at,
    action: row.action,
    actorEmail: row.actor_email,
    targetEmail: row.target_email,
  }));
}

/* ------------------------------------------------------------ self checks --- */

export type MyAccess = {
  signedIn: boolean;
  isAdmin: boolean;
  blocked: boolean;
  /** ISO timestamp or null. */
  proUntil: string | null;
};

/**
 * Server truth about the signed-in account. Called after sign-in and at launch;
 * it cannot be forged by editing local storage, because it never reads it.
 */
export async function fetchMyAccess(): Promise<MyAccess | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await getSupabaseClient().rpc('my_access');
    if (error || !data) return null;

    const raw = data as {
      signed_in?: boolean;
      is_admin?: boolean;
      blocked?: boolean;
      pro_until?: string | null;
    };

    return {
      signedIn: raw.signed_in === true,
      isAdmin: raw.is_admin === true,
      blocked: raw.blocked === true,
      proUntil: raw.pro_until ?? null,
    };
  } catch {
    // Offline is not a reason to change anyone's access; the last known answer
    // (or none at all) stands.
    return null;
  }
}

/** Fire-and-forget heartbeat, so the owner can see who is still around. */
export function recordVisit(): void {
  if (!isSupabaseConfigured()) return;

  void Promise.resolve(getSupabaseClient().rpc('record_visit')).catch(() => undefined);
}

/** Human wording for an audit action. */
export function describeAction(action: string): string {
  switch (action) {
    case 'grant_pro':
      return 'granted Pro';
    case 'revoke_pro':
      return 'removed Pro';
    case 'block':
      return 'paused the account';
    case 'unblock':
      return 'restored the account';
    case 'make_admin':
      return 'made an owner';
    case 'remove_admin':
      return 'removed owner access';
    default:
      return action.replace(/_/g, ' ');
  }
}
