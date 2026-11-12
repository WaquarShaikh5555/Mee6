-- The owner console, and the permissions that make it safe.
--
-- Two problems are solved here.
--
-- 1. **Authority.** Until now `profiles` had one update policy that let a person
--    write *any* column of their own row. `is_admin` lives in that row, so the
--    publishable key that ships inside the app was enough to make yourself the
--    owner with one `PATCH`. The fix is three layers: the column is no longer
--    writable by clients at all (column-level grants), a trigger puts the
--    protected columns back if a future policy ever lets a statement through,
--    and every change of state goes through a `security definer` function that
--    re-checks `is_admin` against the database rather than trusting the app.
--
-- 2. **A console with no code.** The owner can list accounts, grant or revoke
--    Pro, pause or restore an account, and appoint another admin — from the
--    phone, with an audit trail, and with no way to lock themselves out.
--
-- Nothing here trusts the client. Hiding a button is a courtesy, not a
-- permission; every rule below is enforced by Postgres.

begin;

/* ------------------------------------------------------------ columns --- */

alter table public.profiles
  add column if not exists email text,
  add column if not exists is_admin boolean not null default false,
  add column if not exists is_blocked boolean not null default false,
  add column if not exists pro_until timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists note text;

-- Accounts created before `email` existed get theirs from auth.users. This is
-- a one-off backfill; the signup trigger keeps new rows filled in.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is null;

comment on column public.profiles.is_admin is
  'Owner access. Writable only by public.admin_set_access(), never by a client.';
comment on column public.profiles.is_blocked is
  'Paused accounts: the app signs them out and refuses to sign them back in.';
comment on column public.profiles.pro_until is
  'Server-side Pro window granted by the owner. NULL means not granted.';
comment on column public.profiles.last_seen_at is
  'Throttled heartbeat written by public.record_visit().';

/* ----------------------------------------------------- column grants --- */

-- `revoke update` then grant only what a person may change about themselves.
-- This is the part that closes the escalation: with the grant below, a request
-- that names `is_admin` in its SET list is rejected before RLS is consulted.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, updated_at) on public.profiles to authenticated;

/* ------------------------------------------------------- the guard rail --- */

-- Defence in depth. If someone later re-grants UPDATE (or a policy is written
-- that returns true), this still restores every protected column from OLD.
-- Privileged writes are those made by the functions below, which set a
-- transaction-local flag the client has no way to set for itself.
create or replace function public.guard_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.privileged_write', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
    new.email := old.email;
    new.is_admin := old.is_admin;
    new.is_blocked := old.is_blocked;
    new.pro_until := old.pro_until;
    new.last_seen_at := old.last_seen_at;
    new.note := old.note;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_columns() from public, anon, authenticated;

drop trigger if exists profiles_guard_columns on public.profiles;
create trigger profiles_guard_columns
  before update on public.profiles
  for each row execute function public.guard_profile_columns();

-- A paused account cannot even rename itself while paused.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id and not is_blocked)
  with check ((select auth.uid()) = id);

/* ------------------------------------------------------------- helpers --- */

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = uid), false);
$$;

revoke all on function public.is_admin(uuid) from public, anon, authenticated;

create or replace function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or not public.is_admin(me) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  return me;
end;
$$;

revoke all on function public.require_admin() from public, anon, authenticated;

/* --------------------------------------------------------------- audit --- */

create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_email text,
  target_id uuid references public.profiles (id) on delete set null,
  target_email text,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_created_at_idx
  on public.admin_audit (created_at desc);

alter table public.admin_audit enable row level security;

-- No policies at all: the table is readable only through
-- public.admin_recent_actions(), which checks the caller is an admin, and
-- writable only by the definer functions below.
revoke all on public.admin_audit from anon, authenticated;

comment on table public.admin_audit is
  'Every owner action, append-only. Read through admin_recent_actions().';

/* ------------------------------------------------------------ signup fill --- */

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, 'friend'), '@', 1)
    ),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

/* ------------------------------------------------------------ self reads --- */

-- What the app needs to know about itself, in one call: whether the account is
-- paused, whether the owner granted Pro, and whether this is an admin. Every
-- field is server truth.
create or replace function public.my_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  row_state public.profiles%rowtype;
begin
  if me is null then
    return jsonb_build_object('signed_in', false);
  end if;

  select * into row_state from public.profiles p where p.id = me;

  if not found then
    return jsonb_build_object('signed_in', true, 'is_admin', false, 'blocked', false, 'pro_until', null);
  end if;

  return jsonb_build_object(
    'signed_in', true,
    'is_admin', coalesce(row_state.is_admin, false),
    'blocked', coalesce(row_state.is_blocked, false),
    'pro_until', row_state.pro_until,
    'display_name', row_state.display_name
  );
end;
$$;

revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- A heartbeat the owner can see ("last seen"), throttled to one write per five
-- minutes so opening the app does not hammer the database.
create or replace function public.record_visit()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    return;
  end if;

  perform set_config('app.privileged_write', 'on', true);

  update public.profiles
     set last_seen_at = now()
   where id = me
     and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
end;
$$;

revoke all on function public.record_visit() from public, anon;
grant execute on function public.record_visit() to authenticated;

/* ------------------------------------------------------------ the console --- */

create or replace function public.admin_list_users(
  p_query text default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  display_name text,
  email text,
  is_admin boolean,
  is_blocked boolean,
  pro_until timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz,
  note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  return query
  select
    p.id,
    p.display_name,
    p.email,
    coalesce(p.is_admin, false),
    coalesce(p.is_blocked, false),
    p.pro_until,
    p.last_seen_at,
    p.created_at,
    p.note
  from public.profiles p
  where p_query is null
     or btrim(p_query) = ''
     or p.display_name ilike '%' || btrim(p_query) || '%'
     or coalesce(p.email, '') ilike '%' || btrim(p_query) || '%'
  order by coalesce(p.is_admin, false) desc, p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;

revoke all on function public.admin_list_users(text, integer) from public, anon;
grant execute on function public.admin_list_users(text, integer) to authenticated;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  summary jsonb;
begin
  perform public.require_admin();

  select jsonb_build_object(
           'total', count(*),
           'pro', count(*) filter (where pro_until is not null and pro_until > now()),
           'blocked', count(*) filter (where is_blocked),
           'admins', count(*) filter (where is_admin),
           'seen_7d', count(*) filter (where last_seen_at > now() - interval '7 days')
         )
    into summary
    from public.profiles;

  return summary;
end;
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

create or replace function public.admin_recent_actions(p_limit integer default 30)
returns table (
  id bigint,
  created_at timestamptz,
  action text,
  actor_email text,
  target_email text,
  detail jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  return query
  select a.id, a.created_at, a.action, a.actor_email, a.target_email, a.detail
  from public.admin_audit a
  order by a.created_at desc, a.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 200));
end;
$$;

revoke all on function public.admin_recent_actions(integer) from public, anon;
grant execute on function public.admin_recent_actions(integer) to authenticated;

-- The one write path. Every branch re-checks authority, refuses to act on the
-- caller where that would remove their own way back in, and records the change
-- with its before and after state.
create or replace function public.admin_set_access(
  p_target uuid,
  p_action text,
  p_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid;
  before_row public.profiles%rowtype;
  admins integer;
begin
  me := public.require_admin();

  if p_target is null then
    raise exception 'missing_target' using errcode = '22023';
  end if;

  select * into before_row from public.profiles p where p.id = p_target;
  if not found then
    raise exception 'no_such_account' using errcode = 'P0002';
  end if;

  -- Losing your own access is always a mistake, never an intention. Blocking or
  -- demoting yourself is refused outright; you can still demote another admin.
  if p_target = me and p_action in ('block', 'remove_admin', 'revoke_pro') then
    raise exception 'not_on_yourself' using errcode = '22023';
  end if;

  if p_action = 'remove_admin' then
    select count(*) into admins from public.profiles where coalesce(is_admin, false);
    if admins <= 1 then
      raise exception 'last_admin' using errcode = '22023';
    end if;
  end if;

  perform set_config('app.privileged_write', 'on', true);

  case p_action
    when 'grant_pro' then
      update public.profiles
         set pro_until = greatest(coalesce(pro_until, now()), now())
                         + make_interval(days => greatest(least(coalesce(p_days, 30), 3650), 1))
       where id = p_target;

    when 'revoke_pro' then
      update public.profiles set pro_until = null where id = p_target;

    when 'block' then
      update public.profiles set is_blocked = true where id = p_target;

    when 'unblock' then
      update public.profiles set is_blocked = false where id = p_target;

    when 'make_admin' then
      update public.profiles set is_admin = true where id = p_target;

    when 'remove_admin' then
      update public.profiles set is_admin = false where id = p_target;

    else
      raise exception 'unknown_action' using errcode = '22023';
  end case;

  insert into public.admin_audit (actor_id, actor_email, target_id, target_email, action, detail)
  values (
    me,
    (select email from public.profiles where id = me),
    p_target,
    before_row.email,
    p_action,
    jsonb_build_object(
      'before', jsonb_build_object(
        'is_admin', before_row.is_admin,
        'is_blocked', before_row.is_blocked,
        'pro_until', before_row.pro_until
      ),
      'after', (
        select jsonb_build_object(
          'is_admin', p.is_admin,
          'is_blocked', p.is_blocked,
          'pro_until', p.pro_until
        )
        from public.profiles p where p.id = p_target
      )
    )
  );

  return (
    select jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'email', p.email,
      'is_admin', coalesce(p.is_admin, false),
      'is_blocked', coalesce(p.is_blocked, false),
      'pro_until', p.pro_until,
      'last_seen_at', p.last_seen_at,
      'created_at', p.created_at,
      'note', p.note
    )
    from public.profiles p
    where p.id = p_target
  );
end;
$$;

revoke all on function public.admin_set_access(uuid, text, integer) from public, anon;
grant execute on function public.admin_set_access(uuid, text, integer) to authenticated;

commit;
