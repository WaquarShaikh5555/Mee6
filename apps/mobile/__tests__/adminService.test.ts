/**
 * Contract tests between the app and the owner functions in Postgres.
 *
 * The names here are the names in `supabase/migrations/0002_admin.sql`. If one
 * side is renamed without the other, these fail — which is the point: a typo in
 * an RPC name looks exactly like "the console does not work" on a phone.
 */

import {
  AdminError,
  describeAction,
  fetchMyAccess,
  fetchOverview,
  listUsers,
  recentActions,
  setAccess,
} from '@/admin/service';

const mockRpc = jest.fn();

jest.mock('@/auth/supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}));

const ROW = {
  id: '9f1d2c3b-4a5e-4f60-8b71-2c3d4e5f6071',
  display_name: 'Ayesha Khan',
  email: 'ayesha@example.com',
  is_admin: false,
  is_blocked: false,
  pro_until: '2026-12-20T00:00:00.000Z',
  last_seen_at: null,
  created_at: '2026-10-01T09:00:00.000Z',
  note: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listUsers', () => {
  it('calls admin_list_users and maps every column the screen reads', async () => {
    mockRpc.mockResolvedValue({ data: [ROW], error: null });

    const users = await listUsers('  Ayesha ');

    expect(mockRpc).toHaveBeenCalledWith('admin_list_users', {
      p_query: 'Ayesha',
      p_limit: 200,
    });
    expect(users[0]).toEqual({
      id: ROW.id,
      displayName: 'Ayesha Khan',
      email: 'ayesha@example.com',
      isAdmin: false,
      isBlocked: false,
      proUntil: ROW.pro_until,
      lastSeenAt: null,
      createdAt: ROW.created_at,
      note: null,
    });
  });

  it('sends null rather than an empty string for "no filter"', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await listUsers('   ');
    expect(mockRpc).toHaveBeenCalledWith('admin_list_users', {
      p_query: null,
      p_limit: 200,
    });
  });
});

describe('fetchOverview', () => {
  it('maps the snake_case summary', async () => {
    mockRpc.mockResolvedValue({
      data: { total: 12, pro: 3, blocked: 1, admins: 2, seen_7d: 5 },
      error: null,
    });

    await expect(fetchOverview()).resolves.toEqual({
      total: 12,
      pro: 3,
      blocked: 1,
      admins: 2,
      seen7d: 5,
    });
  });
});

describe('setAccess', () => {
  it('passes the action and the day count straight through', async () => {
    mockRpc.mockResolvedValue({ data: { ...ROW, is_admin: true }, error: null });

    const updated = await setAccess(ROW.id, 'make_admin');

    expect(mockRpc).toHaveBeenCalledWith('admin_set_access', {
      p_target: ROW.id,
      p_action: 'make_admin',
      p_days: 30,
    });
    expect(updated.isAdmin).toBe(true);
  });

  it('turns the database refusal into a sentence with a code', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'last_admin', code: 'P0001' },
    });

    await expect(setAccess(ROW.id, 'remove_admin')).rejects.toMatchObject({
      code: 'last-admin',
      message: expect.stringContaining('only owner'),
    });
  });

  it('recognises its own account rule', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_on_yourself' } });

    await expect(setAccess(ROW.id, 'block')).rejects.toBeInstanceOf(AdminError);
    await expect(setAccess(ROW.id, 'block')).rejects.toMatchObject({ code: 'self' });
  });

  it('never claims success when the server says not_authorised', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_authorised', code: '42501' } });

    await expect(setAccess(ROW.id, 'grant_pro')).rejects.toMatchObject({
      code: 'not-authorised',
    });
  });
});

describe('recentActions', () => {
  it('reads the audit trail', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 4,
          created_at: '2026-10-20T10:00:00.000Z',
          action: 'block',
          actor_email: 'owner@example.com',
          target_email: 'ayesha@example.com',
          detail: {},
        },
      ],
      error: null,
    });

    const rows = await recentActions();

    expect(mockRpc).toHaveBeenCalledWith('admin_recent_actions', { p_limit: 12 });
    expect(rows[0]).toEqual({
      id: 4,
      createdAt: '2026-10-20T10:00:00.000Z',
      action: 'block',
      actorEmail: 'owner@example.com',
      targetEmail: 'ayesha@example.com',
    });
  });
});

describe('fetchMyAccess', () => {
  it('reads the server’s own answer, not local storage', async () => {
    mockRpc.mockResolvedValue({
      data: { signed_in: true, is_admin: true, blocked: false, pro_until: null },
      error: null,
    });

    await expect(fetchMyAccess()).resolves.toEqual({
      signedIn: true,
      isAdmin: true,
      blocked: false,
      proUntil: null,
    });
  });

  it('treats a failed read as unknown rather than granted', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    await expect(fetchMyAccess()).resolves.toBeNull();
  });
});

describe('describeAction', () => {
  it('writes every action as a sentence a person can read', () => {
    expect(describeAction('grant_pro')).toBe('granted Pro');
    expect(describeAction('block')).toBe('paused the account');
    expect(describeAction('remove_admin')).toBe('removed owner access');
    // Unknown values stay legible instead of showing a raw identifier.
    expect(describeAction('rotate_keys')).toBe('rotate keys');
  });
});
