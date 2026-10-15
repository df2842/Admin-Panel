# Admin Panel

COMS E6998 - Design for Generative AI

The admin area for [Caption Arena](https://github.com/df2842/Hello-World), the
app where people upload photos, Gemini writes jokes about them, and everyone
votes 👍/👎. Both apps share one Supabase database.

## What it does

- **Dashboard** (`/`): statistics and charts about photos, AI jokes and votes.
- **Media** (`/media`): create, read, update and delete AI-generated media.
  Upload a photo and have Gemini write jokes (or type them by hand), edit or
  delete jokes and descriptions, and delete photos.
- **Users** (`/users`): read every profile with their activity.
- **Votes** (`/votes`): read every upvote and downvote, with filters.

## Security: every route is behind a Google login wall

1. `src/proxy.ts` runs on every request. Visitors who aren't signed in go to
   `/login` (API routes get 401). Signed-in users whose `profiles.is_superadmin`
   isn't `TRUE` go to `/denied` (API routes get 403).
2. Every page, route handler and server action checks again
   (`requireAdmin()` / `checkAdmin()` in `src/lib/admin.ts`).
3. The database enforces it too. Row level security policies in
   [`supabase/week6-admin.sql`](supabase/week6-admin.sql) only let
   superadmins read other users' profiles and votes or change media, so even a
   bug in the app can't expose the data.

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

1. Run [`supabase/week6-admin.sql`](supabase/week6-admin.sql) in the Supabase
   SQL Editor (after the Caption Arena's `schema.sql` and `week4.sql`).
2. Add this app's origin to the Google OAuth client's *Authorized JavaScript
   origins*, and `<origin>/auth/callback` to *Authorized redirect URIs*.
3. Copy `.env.example` to `.env.local` (same Supabase and Google values as
   Caption Arena). `GEMINI_API_KEY` is optional and enables AI joke writing.

```bash
npm install
npm run dev
```
