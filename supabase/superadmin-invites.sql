-- =============================================================================
-- Superadmin invites: make someone a superadmin by e-mail address, whether or
-- not they have signed in yet.
-- Run once in the Supabase SQL Editor (after week6-admin.sql). Safe to re-run.
--
-- week6's bootstrap UPDATE only reaches people who already have a profile row,
-- so they must have signed in once. An invite works either way: the person
-- becomes a superadmin as soon as they sign in with Google using that address.
--
-- To invite someone, use the address of their Google account:
--   insert into public.superadmin_invites (email, note)
--   values (lower('ta@example.com'), 'TA')
--   on conflict (email) do nothing;
-- Then re-run section 3 below, or just wait for their next sign-in.
--
-- To take it back, do BOTH (deleting the invite alone never demotes anyone):
--   delete from public.superadmin_invites
--   where email = lower('ta@example.com');
--   update public.profiles set is_superadmin = false
--   where lower(email) = lower('ta@example.com');
--
-- The list is not reachable through the API: visitors and signed-in users
-- (superadmins included) can neither read nor change it. Like is_superadmin
-- itself, it is managed only here in the SQL Editor.
--
-- If you ever re-run week6-admin.sql, run this file again afterwards: week6
-- re-creates the sync function without the invite step.
-- =============================================================================

-- 1. The invite list ----------------------------------------------------------
-- One row per invited e-mail address, always lower case. RLS is on with
-- deliberately NO policies, and anon / authenticated lose their privileges on
-- the table as well, so neither visitors nor signed-in users (not even
-- superadmins) can read or change the list through the API. Only the SQL
-- Editor can: the same rule as is_superadmin.
create table if not exists public.superadmin_invites (
  email text primary key
    check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note text,
  created_at timestamptz not null default now()
);

alter table public.superadmin_invites enable row level security;

revoke all on public.superadmin_invites from anon, authenticated;

-- 2. Promote invited people when they sign in ---------------------------------
-- The week6 function plus one step; the profile upsert is unchanged. After the
-- upsert, an invited address is promoted only if Google vouches for it: the
-- account's e-mail is confirmed AND the account has a Google identity for that
-- same address that Google does not report as unverified. Signing up for an
-- invited address with an e-mail and password is not enough.
-- The step only ever sets is_superadmin to true (it never demotes), and any
-- error inside it is swallowed, so it can never block a sign-in.
-- The week6 trigger is unchanged: Supabase Auth sets last_sign_in_at at the
-- end of every sign-in, after the Google identity and the e-mail confirmation
-- are stored, so the function sees all of it.
create or replace function public.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, created_at, last_sign_in_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    new.created_at,
    new.last_sign_in_at
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    last_sign_in_at = excluded.last_sign_in_at;

  -- Invited superadmins. Only ever sets true; can never fail the sign-in.
  begin
    if new.email is not null
       and new.email_confirmed_at is not null
       and exists (
         select 1
         from public.superadmin_invites i
         where i.email = lower(new.email)
       )
       and exists (
         select 1
         from auth.identities g
         where g.user_id = new.id
           and g.provider = 'google'
           and lower(g.identity_data ->> 'email') = lower(new.email)
           and coalesce(g.identity_data ->> 'email_verified', 'true') <> 'false'
       )
    then
      update public.profiles
      set is_superadmin = true
      where id = new.id and not is_superadmin;
    end if;
  exception when others then
    null;
  end;

  return new;
end;
$$;

-- 3. Promote invited people who have already signed in ------------------------
-- The same conditions as the function above, for accounts that already exist.
-- Re-run this statement after adding an invite to promote that person now.
update public.profiles p
set is_superadmin = true
from auth.users u
where p.id = u.id
  and not p.is_superadmin
  and u.email is not null
  and u.email_confirmed_at is not null
  and exists (
    select 1
    from public.superadmin_invites i
    where i.email = lower(u.email)
  )
  and exists (
    select 1
    from auth.identities g
    where g.user_id = u.id
      and g.provider = 'google'
      and lower(g.identity_data ->> 'email') = lower(u.email)
      and coalesce(g.identity_data ->> 'email_verified', 'true') <> 'false'
  );

-- 4. Check the result ---------------------------------------------------------
-- One row per invite. "Signed in but not promoted" means an account exists for
-- that address, but not from a verified Google sign-in for it (an e-mail and
-- password signup, for example). Someone who signed in before being invited
-- also shows that way until section 3 has run or they have signed in again.
select
  i.email,
  i.note,
  case
    when m.is_superadmin then 'superadmin now'
    when m.id is null then 'will be promoted at first Google sign-in'
    else 'signed in but not promoted (not a verified Google sign-in for this address)'
  end as status,
  m.last_sign_in_at
from public.superadmin_invites i
left join lateral (
  select p.id, p.is_superadmin, p.last_sign_in_at
  from public.profiles p
  where lower(p.email) = i.email
  order by p.is_superadmin desc, p.last_sign_in_at desc nulls last
  limit 1
) m on true
order by i.created_at, i.email;
