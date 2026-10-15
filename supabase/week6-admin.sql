-- =============================================================================
-- Week 6: profiles + superadmin access for the Admin Panel.
-- Run once in the Supabase SQL Editor (after schema.sql and week4.sql).
-- Safe to re-run.
-- =============================================================================

-- 1. Profiles: one row per signed-in user, mirrored from auth.users ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  is_superadmin boolean not null default false,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

alter table public.profiles enable row level security;

-- Keeps profiles in sync whenever someone signs up or signs in. Runs as the
-- table owner, so it can write profiles even though users cannot. It never
-- touches is_superadmin.
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
  return new;
end;
$$;

drop trigger if exists on_auth_user_synced on auth.users;
create trigger on_auth_user_synced
  after insert or update of email, raw_user_meta_data, last_sign_in_at on auth.users
  for each row execute function public.sync_profile_from_auth();

-- Backfill everyone who has already signed in.
insert into public.profiles (id, email, full_name, avatar_url, created_at, last_sign_in_at)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  u.raw_user_meta_data ->> 'avatar_url',
  u.created_at,
  u.last_sign_in_at
from auth.users u
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  avatar_url = excluded.avatar_url,
  last_sign_in_at = excluded.last_sign_in_at;

-- 2. is_superadmin(): used by every admin policy ------------------------------
-- SECURITY DEFINER so policies on profiles can call it without recursing.
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_superadmin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to anon, authenticated;

-- 3. Row level security --------------------------------------------------------
-- Profiles: you can read your own row; superadmins can read every row.
-- There are deliberately NO insert/update/delete policies, so nobody can make
-- themselves a superadmin through the API. Only the SQL Editor can.
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "Superadmins read all profiles" on public.profiles;
create policy "Superadmins read all profiles"
  on public.profiles for select to authenticated
  using (public.is_superadmin());

-- Votes: users still only see their own; superadmins can read all (READ only).
drop policy if exists "Superadmins read all votes" on public.votes;
create policy "Superadmins read all votes"
  on public.votes for select to authenticated
  using (public.is_superadmin());

-- Images: superadmins can edit and delete any image.
drop policy if exists "Superadmins update images" on public.images;
create policy "Superadmins update images"
  on public.images for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists "Superadmins delete images" on public.images;
create policy "Superadmins delete images"
  on public.images for delete to authenticated
  using (public.is_superadmin());

-- Captions: superadmins can create, edit and delete captions on any image.
drop policy if exists "Superadmins insert captions" on public.captions;
create policy "Superadmins insert captions"
  on public.captions for insert to authenticated
  with check (public.is_superadmin() and user_id = auth.uid());

drop policy if exists "Superadmins update captions" on public.captions;
create policy "Superadmins update captions"
  on public.captions for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists "Superadmins delete captions" on public.captions;
create policy "Superadmins delete captions"
  on public.captions for delete to authenticated
  using (public.is_superadmin());

-- Storage: superadmins can delete any uploaded image file.
drop policy if exists "Superadmins delete any upload" on storage.objects;
create policy "Superadmins delete any upload"
  on storage.objects for delete to authenticated
  using (bucket_id = 'images' and public.is_superadmin());

-- 4. Bootstrap the first superadmin -------------------------------------------
-- The lockout question: if the app only lets superadmins in, who makes the
-- first one? The database owner does, here in the SQL Editor, which runs with
-- full privileges and is not subject to RLS. Sign in once with Google first
-- so your profile row exists.
update public.profiles
set is_superadmin = true
where lower(email) in ('dariusjjfan@gmail.com', 'df2842@columbia.edu');

-- Check the result: your account should show is_superadmin = true.
select email, full_name, is_superadmin, last_sign_in_at
from public.profiles
order by created_at;
