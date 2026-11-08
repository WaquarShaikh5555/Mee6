-- Profiles: app-level data for each account.
--
-- Applied to the live project on 2026-10-21 and recorded here so the schema is
-- version-controlled rather than existing only in the cloud. Supabase manages
-- `auth.users` itself; this table is what the app reads and writes.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile data for each account, one row per auth user.';

alter table public.profiles enable row level security;

-- A person may read and edit only their own row. There is deliberately no
-- insert policy (the trigger below creates rows as the table owner) and no
-- delete policy (deleting the account cascades from auth.users).
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Create a profile whenever an account is created, seeded with the display name
-- passed at sign-up (auth signup options.data.display_name) or the email prefix.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, 'friend'), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at honest without trusting the client to send it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
