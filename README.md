# Admin Panel

COMS E6998 - Design for Generative AI

The admin area for [Caption Arena](https://github.com/df2842/Hello-World), the
app where people upload photos, Gemini writes jokes about them, and everyone
votes 👍/👎. Both apps share one Supabase database.

## What it does

- **Dashboard** (`/`): statistics and charts about photos, AI jokes, votes
  and the AI pipeline.
- **Media** (`/media`): create, read, update and delete images and the
  AI-generated jokes on them. Upload a new photo and have Gemini write jokes
  (or type them by hand), replace a photo's image file, edit or delete jokes
  and descriptions, and delete photos.
- **Users** (`/users`): read every profile with their activity.
- **Votes** (`/votes`): read every upvote and downvote, with filters.

Week 7 adds the domain model behind the AI pipeline. Caption Arena reads these
tables on every generation, so changes here change how jokes get written.

| Section | Route | Tables | Operations |
| --- | --- | --- | --- |
| Terms | `/terms` | `terms` | create, read, update, delete |
| AI examples | `/examples` | `ai_generation_examples` | create, read, update, delete |
| Prompt chains | `/prompt-chains` | `prompt_chains`, `prompt_chain_steps`, `prompt_chain_mix` | read chains and steps; read and update the humor mix |
| Generation requests | `/requests` | `generation_requests` | read |
| LLM responses | `/llm-responses` | `llm_responses` | read |
| Models & providers | `/llm` | `llm_models`, `llm_providers` | create, read, update, delete |
| Sign-in access | `/access` | `allowed_signup_domains`, `whitelisted_emails` | create, read, update, delete |

How Caption Arena uses them:

- **Models and providers.** Active Google models are tried in priority order,
  falling back to the next one when a model is busy. Only models marked
  "Reads photos" are used for the describe-the-photo step.
- **Prompt chain.** The `describe-then-joke` chain's two steps supply the
  system and user prompts and temperatures. A "Mixed bag" batch is split
  across humor flavors by the mix weights.
- **Terms and examples.** Up to 12 active terms and the 4 newest active
  examples are added to the joke prompt.
- **Logging.** Every run is a generation request, and every model attempt
  (prompt, response, latency, tokens) is an LLM response. Runs started from
  this panel are logged too.
- **Sign-in access.** Whitelisted e-mails and superadmins can always sign in.
  Otherwise the e-mail's domain (or a parent domain) must be on the list; an
  empty list lets anyone in. Row level security enforces the same rule on
  every write, not just at sign-in.

## Security: every route is behind a Google login wall

1. `src/proxy.ts` runs on every request. Visitors who aren't signed in go to
   `/login` (API routes get 401). Signed-in users whose `profiles.is_superadmin`
   isn't `TRUE` go to `/denied` (API routes get 403).
2. Every page, route handler and server action checks again
   (`requireAdmin()` / `checkAdmin()` in `src/lib/admin.ts`).
3. The database enforces it too. Row level security policies in
   [`supabase/week6-admin.sql`](supabase/week6-admin.sql) and
   [`supabase/week7-domain.sql`](supabase/week7-domain.sql) only let
   superadmins read other users' profiles, votes and generation logs, or change
   media, AI settings and the access lists, so even a bug in the app can't
   expose the data.

## "Won't you be locked out?"

If only superadmins can get in, who makes the first superadmin? The app
can't, by design: `profiles` has **no** insert, update or delete policies, so
nobody can promote themselves through the API, not even a superadmin.

Instead, the **database owner** does it directly in the Supabase SQL Editor.
That editor runs with full database privileges and is not subject to row
level security:

```sql
update public.profiles set is_superadmin = true where email = 'you@example.com';
```

So the bootstrap path is: sign in once with Google (a trigger creates your
`profiles` row), then run that one statement as the project owner. The end of
`week6-admin.sql` does exactly this.

## Setup

1. Run [`supabase/week6-admin.sql`](supabase/week6-admin.sql) and then
   [`supabase/week7-domain.sql`](supabase/week7-domain.sql) in the Supabase
   SQL Editor (after the Caption Arena's `schema.sql` and `week4.sql`).
   Until `week7-domain.sql` is run, the Week 7 pages show a setup notice and
   Caption Arena uses its built-in defaults.
2. Add this app's origin to the Google OAuth client's *Authorized JavaScript
   origins*, and `<origin>/auth/callback` to *Authorized redirect URIs*.
3. Copy `.env.example` to `.env.local` (same Supabase and Google values as
   Caption Arena). `GEMINI_API_KEY` is optional and enables AI joke writing.

```bash
npm install
npm run dev
```
