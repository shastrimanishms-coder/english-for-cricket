# Supabase Edge Functions

## delete-user

**What it does:** permanently deletes a user's *login account*
(`auth.users`) — the thing a plain database delete cannot do. The
admin panel's **Delete Account** button (Users & Organizations →
master account rows) calls this function.

Behaviour, in plain language:

- Only a signed-in **super_admin** may call it. Anyone else is refused.
- You cannot delete your own admin account through it.
- If the user being deleted is a manager who still has **students**
  in one of their organizations, the function **refuses** and explains
  why — reassign or delete those students first. (Student accounts
  belong to organizations, and organizations belong to managers, so
  silently deleting the manager would strand the students.) An
  organization with no students is removed together with the account.
- On success the login is gone; the profile row follows automatically
  via its foreign key to the auth user.

**Why it exists:** deleting a row from `user_profiles` alone leaves
the person able to sign in (they would just hit a broken profile).
True deletion needs the Auth Admin API, which requires the
service-role key — and that key must never be placed in the app. Edge
Functions run server-side, where `SUPABASE_SERVICE_ROLE_KEY` is
available automatically from the platform environment. **Never copy
the service-role key into the app, the repo, or any client code.**

## Deploy steps (one time)

You need the [Supabase CLI](https://supabase.com/docs/guides/cli)
installed and this project folder open in a terminal.

1. Log in and link this folder to the hosted project:

   ```bash
   npx supabase login
   npx supabase link --project-ref hjckfuthcuxedpgiughj
   ```

   (The project ref is the subdomain of the project URL,
   `hjckfuthcuxedpgiughj.supabase.co`. `supabase login` opens a
   browser / asks for an access token from the Supabase dashboard —
   that token belongs to *your* Supabase account; keep it out of the
   repo.)

2. Deploy the function:

   ```bash
   npx supabase functions deploy delete-user
   ```

3. Done — no secrets to set. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` are injected into the Edge Function
   runtime by Supabase automatically.

Until this function is deployed, the admin panel's Delete Account
button shows a clear "not deployed yet" message and deletes nothing —
by design, so a profile row is never silently deleted in its place.

## Updating later

Edit `supabase/functions/delete-user/index.ts`, then re-run step 2.
