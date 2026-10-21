-- =============================================================================
-- Week 7: the domain model behind Caption Arena's AI pipeline.
-- Run once in the Supabase SQL Editor, after week6-admin.sql. Safe to re-run:
-- tables, checks, indexes, functions and policies are re-applied, but the
-- starter data is only seeded on the first run, so rows you deleted in the
-- Admin Panel stay deleted.
--
--   llm_providers ─< llm_models            (who runs the model, which models, fallback order)
--   prompt_chains ─< prompt_chain_steps    (describe the photo -> write jokes)
--                 ─< prompt_chain_mix      (how a "Mixed bag" batch splits across humor flavors)
--                 ─< ai_generation_examples (few-shot examples fed to the joke step)
--   terms                                   (comedy techniques the joke step may use)
--   generation_requests ─< llm_responses    (every upload / "more jokes" / re-describe run and each model call)
--   allowed_signup_domains, whitelisted_emails (who may sign in and post in Caption Arena)
-- =============================================================================

-- Keeps updated_at current on every UPDATE.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. LLM providers and models
-- ---------------------------------------------------------------------------
create table if not exists public.llm_providers (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  api_base_url text check (api_base_url is null or api_base_url ~ '^https://'),
  docs_url text check (docs_url is null or docs_url ~ '^https://'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.llm_models (
  id bigint generated always as identity primary key,
  -- Deleting a provider that still has models fails (23503).
  provider_id bigint not null references public.llm_providers (id),
  name text not null check (char_length(name) between 1 and 80),
  api_model_id text not null unique check (api_model_id ~ '^[A-Za-z0-9._:/-]{2,100}$'),
  -- Lower runs first. Caption Arena tries active models in this order and
  -- falls back to the next one when a model is busy or fails.
  priority integer not null default 100 check (priority between 0 and 1000),
  supports_vision boolean not null default true,
  is_active boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists llm_models_priority_idx on public.llm_models (is_active, priority);
create index if not exists llm_models_provider_idx on public.llm_models (provider_id);

-- ---------------------------------------------------------------------------
-- 2. Prompt chains, their steps, and the humor-flavor mix
-- ---------------------------------------------------------------------------
create table if not exists public.prompt_chains (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prompt_chain_steps (
  id bigint generated always as identity primary key,
  chain_id bigint not null references public.prompt_chains (id) on delete cascade,
  step_order integer not null check (step_order >= 1),
  name text not null,
  purpose text,
  input_type text not null check (input_type in ('image', 'text')),
  output_type text not null check (output_type in ('text', 'json')),
  -- {{placeholders}} are filled in by the app at run time.
  system_prompt text not null,
  user_prompt text not null,
  temperature numeric(3, 2) not null default 0.7 check (temperature between 0 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain_id, step_order)
);

create table if not exists public.prompt_chain_mix (
  id bigint generated always as identity primary key,
  chain_id bigint not null references public.prompt_chains (id) on delete cascade,
  flavor text not null check (flavor ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  label text not null,
  instruction text not null,
  -- Relative weight. A "Mixed bag" batch of N jokes is split across flavors
  -- in proportion to these weights (0 = never used).
  weight integer not null default 0 check (weight between 0 and 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain_id, flavor)
);

-- ---------------------------------------------------------------------------
-- 3. Terms and AI generation examples (both feed the joke-writing step)
-- ---------------------------------------------------------------------------
create table if not exists public.terms (
  id bigint generated always as identity primary key,
  term text not null check (char_length(term) between 1 and 60),
  definition text not null check (char_length(definition) between 1 and 300),
  example text check (example is null or char_length(example) <= 200),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists terms_term_lower_key on public.terms (lower(term));

create table if not exists public.ai_generation_examples (
  id bigint generated always as identity primary key,
  chain_id bigint references public.prompt_chains (id) on delete set null,
  image_description text not null check (char_length(image_description) between 1 and 600),
  caption text not null check (char_length(caption) between 1 and 200),
  flavor text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_generation_examples_chain_idx on public.ai_generation_examples (chain_id);

-- ---------------------------------------------------------------------------
-- 4. Generation requests and LLM responses (written by Caption Arena and the Admin Panel)
-- ---------------------------------------------------------------------------
create table if not exists public.generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chain_id bigint references public.prompt_chains (id) on delete set null,
  image_id uuid references public.images (id) on delete set null,
  kind text not null,
  style text,
  status text not null default 'running',
  error text,
  caption_count integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists generation_requests_started_idx on public.generation_requests (started_at desc);
create index if not exists generation_requests_user_idx on public.generation_requests (user_id, started_at desc);
create index if not exists generation_requests_chain_idx on public.generation_requests (chain_id, started_at desc);
create index if not exists generation_requests_image_idx on public.generation_requests (image_id);

create table if not exists public.llm_responses (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.generation_requests (id) on delete cascade,
  step_order integer not null,
  step_name text not null,
  model_id bigint references public.llm_models (id) on delete set null,
  api_model_id text not null,
  attempt integer not null default 1,
  status text not null,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  prompt text,          -- the text prompt sent (image bytes are never stored)
  response_text text,   -- what the model returned (truncated)
  error text,
  created_at timestamptz not null default now()
);
create index if not exists llm_responses_request_idx on public.llm_responses (request_id, step_order, attempt);
create index if not exists llm_responses_model_idx on public.llm_responses (model_id);
create index if not exists llm_responses_created_idx on public.llm_responses (created_at desc);

-- Checks on the log tables. Caption Arena writes these rows with the user's
-- own session, so the database has to cap them (the app clips text well below
-- these limits). Named and re-added on every run, so editing one here and
-- re-running updates it.
alter table public.generation_requests
  drop constraint if exists generation_requests_kind_check,
  -- 'describe' = an admin re-describing a photo in the Admin Panel.
  add constraint generation_requests_kind_check check (kind in ('upload', 'more_jokes', 'describe')),
  drop constraint if exists generation_requests_status_check,
  add constraint generation_requests_status_check check (status in ('running', 'succeeded', 'failed')),
  drop constraint if exists generation_requests_caption_count_check,
  add constraint generation_requests_caption_count_check check (caption_count >= 0),
  drop constraint if exists generation_requests_length_check,
  add constraint generation_requests_length_check check (
    coalesce(char_length(style), 0) <= 40 and coalesce(char_length(error), 0) <= 1000);

alter table public.llm_responses
  drop constraint if exists llm_responses_status_check,
  add constraint llm_responses_status_check check (status in ('ok', 'error', 'empty')),
  drop constraint if exists llm_responses_numbers_check,
  add constraint llm_responses_numbers_check check (
    step_order >= 1 and attempt >= 1
    and coalesce(latency_ms, 0) >= 0 and coalesce(input_tokens, 0) >= 0 and coalesce(output_tokens, 0) >= 0),
  drop constraint if exists llm_responses_length_check,
  add constraint llm_responses_length_check check (
    char_length(step_name) <= 100 and char_length(api_model_id) <= 100
    and coalesce(char_length(prompt), 0) <= 8000
    and coalesce(char_length(response_text), 0) <= 8000
    and coalesce(char_length(error), 0) <= 2000);

-- Link each caption to the request that produced it.
alter table public.captions
  add column if not exists request_id uuid references public.generation_requests (id) on delete set null;
create index if not exists captions_request_idx on public.captions (request_id);

-- ---------------------------------------------------------------------------
-- 5. Sign-in access: allowed domains and whitelisted e-mail addresses
-- ---------------------------------------------------------------------------
create table if not exists public.allowed_signup_domains (
  id bigint generated always as identity primary key,
  domain text not null unique
    check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  note text check (note is null or char_length(note) <= 200),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists allowed_signup_domains_created_by_idx on public.allowed_signup_domains (created_by);

create table if not exists public.whitelisted_emails (
  id bigint generated always as identity primary key,
  email text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note text check (note is null or char_length(note) <= 200),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whitelisted_emails_created_by_idx on public.whitelisted_emails (created_by);

-- Who may sign in? Checks ONLY the caller's own e-mail (from their
-- JWT), so it can't be used to probe the lists. Caption Arena checks it at
-- sign-in; section 7 also checks it on every new photo, caption, vote and log.
--   superadmin or whitelisted e-mail -> yes
--   no allowed domains configured     -> yes (open sign-up)
--   e-mail domain (or a subdomain of it) is allowed -> yes
create or replace function public.is_signup_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select lower(coalesce(auth.jwt() ->> 'email', '')) as email)
  select case
    when (select email from me) = '' then false
    when exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_superadmin) then true
    when exists (select 1 from public.whitelisted_emails w where w.email = (select email from me)) then true
    when not exists (select 1 from public.allowed_signup_domains) then true
    else exists (
      select 1
      from public.allowed_signup_domains d
      where split_part((select email from me), '@', 2) = d.domain
         or split_part((select email from me), '@', 2) like '%.' || d.domain
    )
  end;
$$;
-- Supabase also grants new functions to anon directly, so revoke that too.
revoke all on function public.is_signup_allowed() from public, anon;
grant execute on function public.is_signup_allowed() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'llm_providers', 'llm_models', 'prompt_chains', 'prompt_chain_steps', 'prompt_chain_mix',
    'terms', 'ai_generation_examples', 'allowed_signup_domains', 'whitelisted_emails'
  ] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format(
      'create trigger touch_updated_at before update on public.%I
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Row level security
-- ---------------------------------------------------------------------------
alter table public.llm_providers enable row level security;
alter table public.llm_models enable row level security;
alter table public.prompt_chains enable row level security;
alter table public.prompt_chain_steps enable row level security;
alter table public.prompt_chain_mix enable row level security;
alter table public.terms enable row level security;
alter table public.ai_generation_examples enable row level security;
alter table public.generation_requests enable row level security;
alter table public.llm_responses enable row level security;
alter table public.allowed_signup_domains enable row level security;
alter table public.whitelisted_emails enable row level security;

-- AI configuration: readable by everyone (Caption Arena's pipeline reads it;
-- nothing in it is secret). Only superadmins may change it.
do $$
declare t text;
begin
  foreach t in array array[
    'llm_providers', 'llm_models', 'prompt_chains', 'prompt_chain_steps', 'prompt_chain_mix',
    'terms', 'ai_generation_examples'
  ] loop
    execute format('drop policy if exists "Anyone can read %s" on public.%I', t, t);
    execute format(
      'create policy "Anyone can read %s" on public.%I for select to anon, authenticated using (true)', t, t);
  end loop;
end $$;

-- Policies call auth.uid() / is_superadmin() as (select ...), so Postgres runs
-- them once per statement instead of once per row.

-- Full CRUD for superadmins on providers, models, terms and examples.
do $$
declare t text;
begin
  foreach t in array array['llm_providers', 'llm_models', 'terms', 'ai_generation_examples'] loop
    execute format('drop policy if exists "Superadmins insert %s" on public.%I', t, t);
    execute format(
      'create policy "Superadmins insert %s" on public.%I for insert to authenticated
         with check ((select public.is_superadmin()))', t, t);
    execute format('drop policy if exists "Superadmins update %s" on public.%I', t, t);
    execute format(
      'create policy "Superadmins update %s" on public.%I for update to authenticated
         using ((select public.is_superadmin())) with check ((select public.is_superadmin()))', t, t);
    execute format('drop policy if exists "Superadmins delete %s" on public.%I', t, t);
    execute format(
      'create policy "Superadmins delete %s" on public.%I for delete to authenticated
         using ((select public.is_superadmin()))', t, t);
  end loop;
end $$;

-- Prompt chains and steps are read-only from the apps (changed via SQL).
-- The mix can be updated (weights) by superadmins.
drop policy if exists "Superadmins update prompt_chain_mix" on public.prompt_chain_mix;
create policy "Superadmins update prompt_chain_mix"
  on public.prompt_chain_mix for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));

-- Generation requests: each user writes and reads their own; superadmins read all.
drop policy if exists "Users create own generation requests" on public.generation_requests;
create policy "Users create own generation requests"
  on public.generation_requests for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users update own generation requests" on public.generation_requests;
create policy "Users update own generation requests"
  on public.generation_requests for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Users read own generation requests" on public.generation_requests;
create policy "Users read own generation requests"
  on public.generation_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_superadmin()));

-- LLM responses: written for your own requests; readable by you and superadmins.
drop policy if exists "Users log responses for own requests" on public.llm_responses;
create policy "Users log responses for own requests"
  on public.llm_responses for insert to authenticated
  with check (exists (
    select 1 from public.generation_requests r where r.id = request_id and r.user_id = (select auth.uid())
  ));

drop policy if exists "Read own or all as superadmin llm responses" on public.llm_responses;
create policy "Read own or all as superadmin llm responses"
  on public.llm_responses for select to authenticated
  using (
    (select public.is_superadmin())
    or exists (select 1 from public.generation_requests r where r.id = request_id and r.user_id = (select auth.uid()))
  );

-- Access lists: superadmins only, for every operation.
do $$
declare t text;
begin
  foreach t in array array['allowed_signup_domains', 'whitelisted_emails'] loop
    execute format('drop policy if exists "Superadmins manage %s" on public.%I', t, t);
    execute format(
      'create policy "Superadmins manage %s" on public.%I for all to authenticated
         using ((select public.is_superadmin())) with check ((select public.is_superadmin()))', t, t);
  end loop;
end $$;

-- Storage: superadmins can upload into any user's folder, so Replace photo
-- keeps the new file in the owner's folder and the owner can still delete it.
drop policy if exists "Superadmins upload into any folder" on storage.objects;
create policy "Superadmins upload into any folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (select public.is_superadmin()));

-- The policies below are RESTRICTIVE: they are AND-ed with every other policy
-- on the table (including week4/week6), so they can only take access away.

-- Sign-in allow-list, enforced on writes too. Caption Arena's callback signs
-- blocked accounts out, but a session made another way (or one from before a
-- domain was removed) would still work. A blocked account can still read and
-- delete its own rows, just not add or change any. Superadmins always pass.
do $$
declare p text[];
begin
  foreach p slice 1 in array array[
    ['images', 'insert'], ['captions', 'insert'], ['votes', 'insert'], ['votes', 'update'],
    ['generation_requests', 'insert'], ['generation_requests', 'update'], ['llm_responses', 'insert']
  ] loop
    execute format('drop policy if exists "Only allowed accounts %s" on public.%I', p[2], p[1]);
    execute format(
      'create policy "Only allowed accounts %s" on public.%I as restrictive for %s to authenticated
         with check ((select public.is_signup_allowed()))', p[2], p[1], p[2]);
  end loop;
end $$;

drop policy if exists "Only allowed accounts insert" on storage.objects;
create policy "Only allowed accounts insert"
  on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'images' or (select public.is_signup_allowed()));

-- Links must point at your own rows (superadmins: any). Foreign keys ignore
-- RLS, so without these anyone could file a caption under someone else's
-- request, or log a run against someone else's photo.
do $$
declare cmd text;
begin
  foreach cmd in array array['insert', 'update'] loop
    execute format('drop policy if exists "Caption request must be yours (%s)" on public.captions', cmd);
    execute format(
      'create policy "Caption request must be yours (%s)" on public.captions as restrictive for %s to authenticated
         with check (captions.request_id is null or exists (
           select 1 from public.generation_requests r
           where r.id = captions.request_id and (r.user_id = (select auth.uid()) or (select public.is_superadmin()))))',
      cmd, cmd);
    execute format('drop policy if exists "Request image must be yours (%s)" on public.generation_requests', cmd);
    execute format(
      'create policy "Request image must be yours (%s)" on public.generation_requests as restrictive for %s to authenticated
         with check (generation_requests.image_id is null or (select public.is_superadmin()) or exists (
           select 1 from public.images i
           where i.id = generation_requests.image_id and i.user_id = (select auth.uid())))',
      cmd, cmd);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Seed data (matches what Caption Arena did before this migration).
--    First run only: once the describe-then-joke chain exists (only SQL can
--    delete it), a re-run skips this block, so it never brings back rows you
--    deleted in the Admin Panel.
-- ---------------------------------------------------------------------------
do $$
begin
if exists (select 1 from public.prompt_chains where slug = 'describe-then-joke') then
  raise notice 'Week 7 starter data is already there; not seeding it again.';
  return;
end if;

insert into public.llm_providers (name, slug, api_base_url, docs_url)
values ('Google (Gemini API)', 'google', 'https://generativelanguage.googleapis.com',
        'https://ai.google.dev/gemini-api/docs')
on conflict (slug) do nothing;

insert into public.llm_models (provider_id, name, api_model_id, priority, supports_vision, notes)
select p.id, m.name, m.api_model_id, m.priority, true, m.notes
from public.llm_providers p
cross join (values
  ('Gemini 3.5 Flash-Lite', 'gemini-3.5-flash-lite', 10, 'Primary: cheapest and fastest (about 1 s per call).'),
  ('Gemini 3.1 Flash-Lite', 'gemini-3.1-flash-lite', 20, 'First fallback.'),
  ('Gemini Flash-Lite (latest)', 'gemini-flash-lite-latest', 30, 'Last fallback; alias that tracks the newest Flash-Lite.')
) as m(name, api_model_id, priority, notes)
where p.slug = 'google'
on conflict (api_model_id) do nothing;

insert into public.prompt_chains (slug, name, description)
values ('describe-then-joke', 'Describe, then joke',
        'Step 1 looks at the photo and describes it. Step 2 turns that description into jokes about the photo.')
on conflict (slug) do nothing;

insert into public.prompt_chain_steps
  (chain_id, step_order, name, purpose, input_type, output_type, system_prompt, user_prompt, temperature)
select c.id, s.step_order, s.name, s.purpose, s.input_type, s.output_type, s.system_prompt, s.user_prompt, s.temperature
from public.prompt_chains c
cross join (values
  (1, 'Describe the photo', 'A vision model writes a vivid, neutral description for a comedy writer who cannot see the photo.',
   'image', 'text',
   'You describe photos for a comedy writer who cannot see them. Be concrete and vivid: who or what is in the frame, expressions, body language, setting, any text in the image, and anything odd, awkward or surprising. Two to four sentences of plain prose, no lists. Describe people neutrally and never guess their identity.',
   'Describe this image.', 0.50),
  (2, 'Write the jokes', 'Turns the description into jokes in the chosen style, using the active terms and examples.',
   'text', 'json',
   'You write captions that get printed under a photo. Write exactly {{count}} jokes about the photo described. Every joke must hinge on a specific detail of THIS photo, something you could only write after seeing it, not a generic one-liner. {{style}} Each caption is one punchy line under 90 characters. No hashtags, no emojis, no surrounding quotation marks, no explanations. Keep it PG-13 and never mock anyone''s body, race, gender or identity.',
   'Photo description:
{{description}}', 1.00)
) as s(step_order, name, purpose, input_type, output_type, system_prompt, user_prompt, temperature)
where c.slug = 'describe-then-joke'
on conflict (chain_id, step_order) do nothing;

insert into public.prompt_chain_mix (chain_id, flavor, label, instruction, weight, sort_order)
select c.id, f.flavor, f.label, f.instruction, f.weight, f.sort_order
from public.prompt_chains c
cross join (values
  ('deadpan', 'Deadpan', 'a dry, deadpan observation', 25, 1),
  ('wordplay', 'Wordplay', 'a pun or wordplay', 25, 2),
  ('absurd', 'Absurd escalation', 'an absurd escalation delivered with a straight face', 25, 3),
  ('relatable', 'Painfully relatable', 'a painfully relatable line', 25, 4),
  ('roast-lite', 'Gentle roast', 'a gentle, good-natured roast of the situation (never of a person''s looks)', 0, 5)
) as f(flavor, label, instruction, weight, sort_order)
where c.slug = 'describe-then-joke'
on conflict (chain_id, flavor) do nothing;

insert into public.terms (term, definition, example)
values
  ('Misdirection', 'Set up an expectation, then pay it off with something the audience did not see coming.',
   'I told my cat a joke about lasers. It went right over his head, then he chased it for an hour.'),
  ('Rule of three', 'List two normal things and make the third one absurd.',
   'Essentials for camping: a tent, a flashlight, and the emotional support of a rotisserie chicken.'),
  ('Callback', 'Refer back to an earlier detail for a second laugh.', null),
  ('Understatement', 'Describe something huge as if it were minor.',
   'The kitchen fire was a small setback for my soufflé career.'),
  ('Hyperbole', 'Exaggerate wildly for effect.',
   'This coffee is so strong it filed my taxes.'),
  ('Anthropomorphism', 'Give an object or animal human thoughts and motives.',
   'The toaster has been judging my bread choices for years.'),
  ('Bathos', 'Drop suddenly from the grand to the mundane.',
   'He stood on the mountaintop, gazed at the endless horizon, and wondered if he left the oven on.')
on conflict do nothing;

insert into public.ai_generation_examples (chain_id, image_description, caption, flavor)
select c.id, e.image_description, e.caption, e.flavor
from public.prompt_chains c
cross join (values
  ('A golden retriever sits at a dinner table wearing a bib, staring intensely at an empty plate.',
   'He has been told dinner is at six. It is 6:01. He has questions.', 'deadpan'),
  ('A person in a business suit balances on a skateboard in an empty office hallway, arms flailing.',
   'Quarterly growth was not the kind of rolling momentum management had in mind.', 'wordplay'),
  ('A tiny houseplant sits alone on a huge empty desk under a dramatic spotlight.',
   'Day 1 of the plant''s solo career: it has already outgrown the band.', 'absurd')
) as e(image_description, caption, flavor)
where c.slug = 'describe-then-joke'
  and not exists (select 1 from public.ai_generation_examples x where x.caption = e.caption);

insert into public.allowed_signup_domains (domain, note)
values
  ('columbia.edu', 'Columbia University'),
  ('barnard.edu', 'Barnard College'),
  ('gmail.com', 'Personal Google accounts')
on conflict (domain) do nothing;

insert into public.whitelisted_emails (email, note)
values
  ('dariusjjfan@gmail.com', 'Owner'),
  ('df2842@columbia.edu', 'Owner')
on conflict (email) do nothing;
end $$;

-- Check: each table and its row count.
select 'llm_providers' as table_name, count(*) from public.llm_providers
union all select 'llm_models', count(*) from public.llm_models
union all select 'prompt_chains', count(*) from public.prompt_chains
union all select 'prompt_chain_steps', count(*) from public.prompt_chain_steps
union all select 'prompt_chain_mix', count(*) from public.prompt_chain_mix
union all select 'terms', count(*) from public.terms
union all select 'ai_generation_examples', count(*) from public.ai_generation_examples
union all select 'generation_requests', count(*) from public.generation_requests
union all select 'llm_responses', count(*) from public.llm_responses
union all select 'allowed_signup_domains', count(*) from public.allowed_signup_domains
union all select 'whitelisted_emails', count(*) from public.whitelisted_emails;
