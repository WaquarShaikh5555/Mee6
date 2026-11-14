-- Let a person delete their own account, from inside the app.
--
-- Until now the only route was "ask the owner", which is not a route: it
-- depends on somebody reading a message. Google Play requires deletion to be
-- available in the app itself for any app with accounts, and a privacy policy
-- that promises deletion needs code behind it.
--
-- The function is SECURITY DEFINER because `auth.users` is owned by the auth
-- service; a signed-in client cannot touch it directly. Two properties make
-- that safe:
--
--   1. The only id it will ever delete is `auth.uid()` — the id in the verified
--      JWT of the caller. There is no parameter to point it at someone else.
--   2. It is the *only* way to remove an auth user from the client side; the
--      table stays closed to `anon` and `authenticated`.
--
-- Deleting the auth user cascades: `profiles` references it with ON DELETE
-- CASCADE, so the profile row, the email, the display name and any owned data
-- go with it in the same transaction. The audit trail keeps the *text* of past
-- owner actions (actor and target emails) but its foreign keys are set to null,
-- so nothing is left pointing at a person who asked to be forgotten.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  -- Deleting the account leaves nothing to sign back in to. Refuse to pretend
  -- otherwise if the row has already gone.
  delete from auth.users where id = me;

  if not found then
    raise exception 'no_such_account' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Deletes the calling account and everything that cascades from it. No parameters: it can only ever delete auth.uid().';
