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

## send-support-email

**What it does:** sends support mail through the project's **own
SMTP server** (the Lolipop mailboxes on the project's domain), in
two modes:

- **Notify mode** (default): emails one support-form submission to
  the support inbox. The support page stores every message in the
  `support_messages` table first — that table is the record of
  truth. This mode is only the notification layer, so a mail-server
  problem can never lose a message.
- **Reply mode** (`"mode": "reply"` in the request): emails the
  admin's reply to a support message, from the admin panel's
  Support inbox.

Behaviour, in plain language:

- **Notify mode** may be called by anyone — it backs a public
  contact form, exactly like the form on any website. Name, email
  and message are required and length-capped (name 100, email 254,
  subject 150, message 5000 characters); anything else is refused
  with a plain-language error.
- **Reply mode** is locked down: the caller must be signed in and
  have the **super_admin** role. The function resolves the caller's
  JWT against the Supabase auth API and reads the role from
  `user_profiles` — a role claim in the request body is never
  trusted. Anyone else gets `403 Forbidden`. Reply subject is
  capped at 200 characters, message at 5000.
- Both modes send **from the SMTP mailbox itself** (`SMTP_USER`) —
  set `SMTP_USER` to the **noreply@englishforcricket.com** mailbox
  so notifications and admin replies alike come from noreply@,
  never from a personal address. In notify mode the submitter's
  address is in **Reply-To**, so pressing reply in the mailbox
  answers the person who wrote in; in reply mode **Reply-To** is
  the support address, so if the recipient answers by email it
  lands in the support inbox instead of the unmonitored noreply
  mailbox. Notify subjects are `[Support] <their subject>`, or
  `[Support] New message from <name>` when they left the subject
  blank. Bodies are plain text.
- The SMTP password exists **only** as a Supabase secret. It is
  never in the app, the repo, or any client code — same rule as the
  service-role key above.
- On any failure the caller gets a generic "could not be emailed"
  message; the real SMTP error is written to the function's server
  logs only, never returned.

**⚠️ Port warning (important):** Supabase's hosted platform does
**not** allow outgoing connections to ports **25 or 587** from Edge
Functions (see Supabase's Edge Functions limits page). Port **465**
is allowed. So for this project use port **465** with implicit TLS
(`SMTP_SECURE=tls`) — Lolipop offers SMTPS on 465. Port 587
(STARTTLS) is supported by the code (`SMTP_SECURE=starttls`) but
will time out while the function is hosted on Supabase.

## Deploy steps (one time)

Same CLI setup as `delete-user` above: `npx supabase login` and
`npx supabase link --project-ref hjckfuthcuxedpgiughj` if you have
not already done them for this project.

1. Set the SMTP secrets. Use the real values from the Lolipop
   control panel (mail server host, and the password of the
   **noreply@** mailbox you send from). **Never commit these values
   to the repo or paste them into app code.**

   ```bash
   npx supabase secrets set SMTP_HOST=<lolipop-smtp-host> SMTP_PORT=465 SMTP_SECURE=tls SMTP_USER=noreply@englishforcricket.com SMTP_PASS=<noreply-mailbox-password> SUPPORT_TO_EMAIL=support@englishforcricket.com
   ```

   - `SMTP_HOST` — Lolipop's outgoing (SMTP) server name.
   - `SMTP_PORT` / `SMTP_SECURE` — `465` + `tls` (see the port
     warning above). `SMTP_SECURE` may be omitted: the function then
     treats port 465 as implicit TLS and any other port as STARTTLS.
   - `SMTP_USER` / `SMTP_PASS` — the **noreply@englishforcricket.com**
     mailbox login (usually the full email address) and its
     password. Both notification emails and admin replies are sent
     from this mailbox.
   - `SUPPORT_TO_EMAIL` — where form notifications are delivered
     (the support inbox the owner reads).

2. Deploy the function:

   ```bash
   npx supabase functions deploy send-support-email
   ```

3. Smoke-test it with curl (placeholder values — replace the anon
   key with the project's public anon key from the app's `.env`,
   which is safe to use here):

   ```bash
   curl -i -X POST \
     'https://hjckfuthcuxedpgiughj.supabase.co/functions/v1/send-support-email' \
     -H 'Authorization: Bearer <EXPO_PUBLIC_SUPABASE_ANON_KEY>' \
     -H 'apikey: <EXPO_PUBLIC_SUPABASE_ANON_KEY>' \
     -H 'Content-Type: application/json' \
     -d '{"name":"Test User","email":"test@example.com","subject":"Smoke test","message":"Hello, this is a test of the support form email."}'
   ```

   Expected: `200 {"ok":true}` and the message arrives in the
   support mailbox. A `500` at this step almost always means a wrong
   secret — check the function's logs in the Supabase dashboard
   (Edge Functions → send-support-email → Logs) for the real SMTP
   error.

   To test **reply mode**, the request must carry a signed-in
   super_admin's JWT as the `Authorization: Bearer` token (the
   admin panel attaches it automatically via
   `supabase.functions.invoke`). The same curl with
   `-d '{"mode":"reply","to":"test@example.com","subject":"Re: Smoke test","message":"Thanks for writing in."}'`
   should return `200 {"ok":true}` with the reply arriving from the
   noreply@ mailbox — and the identical call **without** a valid
   admin token must return `403 {"error":"Forbidden"}`.

## Updating later

Edit `supabase/functions/send-support-email/index.ts`, then re-run
step 2. To change any mail setting, re-run step 1 with the new
values — no code change or redeploy is needed for secrets.
