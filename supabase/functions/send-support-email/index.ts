// send-support-email — sends support mail through the project's OWN
// SMTP server. Two modes:
//
// MODE 1 — "notify" (default, no `mode` field in the request):
//   Emails one support-form submission to the support inbox.
//   WHY: the support page's contact form stores every message in
//   public.support_messages (that table is the record of truth —
//   nothing is lost if email fails). This mode is only the
//   notification layer on top, so the owner sees new messages in his
//   normal mailbox without opening the admin panel.
//   REQUEST:  POST { "name": "...", "email": "...",
//                    "subject": "..." (optional), "message": "..." }
//   CALLER:   anyone — it backs a public contact form, exactly like
//             the form on any website. Input validation and length
//             caps are the abuse guard, and every message is ALSO
//             stored in support_messages by the caller, so spam can
//             be reviewed and deleted in the admin panel.
//
// MODE 2 — "reply" (admin panel only):
//   Emails the super_admin's reply to a support message.
//   REQUEST:  POST { "mode": "reply", "to": "...", "subject": "...",
//                    "message": "..." }  + the caller's Supabase JWT
//             in the Authorization header (supabase.functions.invoke
//             attaches it automatically).
//   CALLER:   MUST be signed in AND have user_profiles.role =
//             'super_admin'. The JWT is resolved against the Supabase
//             auth API and the role is read from the database — a
//             role claim in the request body is never trusted.
//             Anyone else gets 403 { "error": "Forbidden" }.
//
// SHARED BEHAVIOUR:
//   RESPONSE: 200 { "ok": true }
//             400 { "error": "<plain-language reason>" }  (bad input)
//             403 { "error": "Forbidden" }               (reply mode)
//             405 { "error": "Method not allowed" }
//             500 { "error": "<plain-language reason>" }  (not
//                   configured, or the mail server refused/failed —
//                   SMTP internals are logged server-side only,
//                   never returned to the caller)
//   FROM:     always the SMTP_USER mailbox (the noreply@ mailbox),
//             in both modes. Mail servers (Lolipop included)
//             typically refuse a From that is not the authenticated
//             account. In notify mode the submitter goes in Reply-To
//             so "reply" answers them directly; in reply mode
//             Reply-To is SUPPORT_TO_EMAIL, so if the recipient
//             answers by email it lands in the support inbox rather
//             than the unmonitored noreply mailbox.
//   SECRETS:  the SMTP password must never ship in the app. It lives
//             in Supabase secrets (SMTP_PASS etc., set with
//             `supabase secrets set`) and is only readable here,
//             server-side. See supabase/functions/README.md.
//
// TLS MODES (secret SMTP_SECURE, optional):
//   "tls"      → implicit TLS from the first byte (normally port 465)
//   "starttls" → plain connect, upgraded with STARTTLS (port 587)
//   unset      → auto: port 465 uses "tls", anything else "starttls"
//
// ⚠️ SUPABASE HOSTED PLATFORM LIMIT: Supabase's own Limits doc says
// outgoing connections to ports 25 and 587 are NOT allowed from
// hosted Edge Functions. Port 465 is not blocked, so for this
// project set SMTP_PORT=465 and SMTP_SECURE=tls (Lolipop offers
// SMTPS on 465). Port 587 would only work if this function were
// hosted somewhere else.

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Input caps: generous for a real support message, small enough that
// the endpoint cannot be used to relay bulk mail.
const MAX_NAME = 100;
const MAX_EMAIL = 254; // RFC 5321 maximum address length
const MAX_SUBJECT = 150; // notify mode (the form's subject field)
const MAX_REPLY_SUBJECT = 200; // reply mode ("Re: ..." subjects run longer)
const MAX_MESSAGE = 5000;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Header-bound values (name, subject) must never carry line breaks —
// a CR/LF here would let a submitter inject extra mail headers.
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  toEmail: string; // SUPPORT_TO_EMAIL — notification destination
  useTls: boolean;
}

// Reads the SMTP secrets. Returns null (after logging the real
// problem server-side) when anything is missing or malformed —
// callers turn that into a plain 500 that exposes no secret values.
function loadSmtpConfig(): SmtpConfig | null {
  const host = Deno.env.get('SMTP_HOST') ?? '';
  const portRaw = Deno.env.get('SMTP_PORT') ?? '';
  const user = Deno.env.get('SMTP_USER') ?? '';
  const pass = Deno.env.get('SMTP_PASS') ?? '';
  const toEmail = Deno.env.get('SUPPORT_TO_EMAIL') ?? '';
  if (!host || !portRaw || !user || !pass || !toEmail) {
    console.error(
      'send-support-email: missing SMTP configuration. Set SMTP_HOST, ' +
        'SMTP_PORT, SMTP_USER, SMTP_PASS and SUPPORT_TO_EMAIL as secrets.',
    );
    return null;
  }
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`send-support-email: SMTP_PORT is not a valid port: "${portRaw}"`);
    return null;
  }
  // TLS mode: explicit secret wins; otherwise 465 ⇒ implicit TLS,
  // anything else ⇒ STARTTLS.
  const secureRaw = (Deno.env.get('SMTP_SECURE') ?? '').trim().toLowerCase();
  const useTls = secureRaw === 'tls' || secureRaw === 'true'
    ? true
    : secureRaw === 'starttls' || secureRaw === 'false'
    ? false
    : port === 465;
  return { host, port, user, pass, toEmail, useTls };
}

// Sends exactly one plain-text email. Throws on failure — the caller
// logs the real error (SMTP errors can contain server banners and
// auth detail) and returns a generic 500.
async function sendMail(
  cfg: SmtpConfig,
  mail: { to: string; subject: string; content: string; replyTo?: string },
): Promise<void> {
  const client = new SMTPClient({
    connection: {
      hostname: cfg.host,
      port: cfg.port,
      tls: cfg.useTls,
      auth: { username: cfg.user, password: cfg.pass },
    },
  });
  try {
    await client.send({
      from: cfg.user,
      to: mail.to,
      replyTo: mail.replyTo,
      subject: mail.subject,
      content: mail.content,
    });
  } finally {
    try {
      await client.close();
    } catch {
      // Connection already gone — nothing useful to do.
    }
  }
}

const NOT_CONFIGURED = {
  error: 'Email is not set up on the server yet, so your message could not be emailed.',
};
const SEND_FAILED = {
  error: 'Your message could not be emailed just now. Please try again later.',
};

// MODE 2 gate: resolves the caller from their JWT and confirms
// user_profiles.role = 'super_admin'. Mirrors delete-user's caller
// verification. Any failure — no header, bad token, no profile, any
// other role — is simply "not allowed" (403 at the call site).
async function isSuperAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return false;

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('send-support-email: SUPABASE_URL / key env vars missing.');
    return false;
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData?.user) return false;

  // Service-role client: bypasses row-level security, so the role
  // check below is the explicit gate.
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('role')
    .eq('id', callerData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error('send-support-email: role check failed:', profileError.message);
    return false;
  }
  return profile?.role === 'super_admin';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }
  const mode = body?.mode === 'reply' ? 'reply' : 'notify';

  // ---------------- MODE 2: admin reply ----------------
  if (mode === 'reply') {
    // Verify the caller BEFORE anything else: unauthenticated and
    // non-admin callers learn nothing beyond "Forbidden".
    if (!(await isSuperAdmin(req))) {
      return json({ error: 'Forbidden' }, 403);
    }

    const to = typeof body?.to === 'string' ? body.to.trim() : '';
    const subject = typeof body?.subject === 'string' ? oneLine(body.subject) : '';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!to || to.length > MAX_EMAIL || !EMAIL_SHAPE.test(to)) {
      return json({ error: 'Please give a valid email address to reply to.' }, 400);
    }
    if (!subject) {
      return json({ error: 'Please give the reply a subject.' }, 400);
    }
    if (subject.length > MAX_REPLY_SUBJECT) {
      return json({ error: `Subject is too long (max ${MAX_REPLY_SUBJECT} characters).` }, 400);
    }
    if (!message) {
      return json({ error: 'Please write a reply message.' }, 400);
    }
    if (message.length > MAX_MESSAGE) {
      return json({ error: `Message is too long (max ${MAX_MESSAGE} characters).` }, 400);
    }

    const cfg = loadSmtpConfig();
    if (!cfg) return json(NOT_CONFIGURED, 500);
    try {
      await sendMail(cfg, {
        to,
        replyTo: cfg.toEmail,
        subject,
        content: message,
      });
    } catch (err) {
      console.error('send-support-email: SMTP reply send failed:', err);
      return json(SEND_FAILED, 500);
    }
    return json({ ok: true }, 200);
  }

  // ---------------- MODE 1: form notification (default) ----------------
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const subject = typeof body?.subject === 'string' ? oneLine(body.subject) : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!name) {
    return json({ error: 'Please give your name.' }, 400);
  }
  if (name.length > MAX_NAME) {
    return json({ error: `Name is too long (max ${MAX_NAME} characters).` }, 400);
  }
  if (!email || email.length > MAX_EMAIL || !EMAIL_SHAPE.test(email)) {
    return json({ error: 'Please give a valid email address.' }, 400);
  }
  if (subject.length > MAX_SUBJECT) {
    return json({ error: `Subject is too long (max ${MAX_SUBJECT} characters).` }, 400);
  }
  if (!message) {
    return json({ error: 'Please write a message.' }, 400);
  }
  if (message.length > MAX_MESSAGE) {
    return json({ error: `Message is too long (max ${MAX_MESSAGE} characters).` }, 400);
  }
  const safeName = oneLine(name);

  const cfg = loadSmtpConfig();
  if (!cfg) return json(NOT_CONFIGURED, 500);
  try {
    await sendMail(cfg, {
      to: cfg.toEmail,
      replyTo: email,
      subject: `[Support] ${subject || `New message from ${safeName}`}`,
      content: [
        `Name: ${safeName}`,
        `Email: ${email}`,
        `Subject: ${subject || '(none)'}`,
        '',
        message,
      ].join('\n'),
    });
  } catch (err) {
    console.error('send-support-email: SMTP notify send failed:', err);
    return json(SEND_FAILED, 500);
  }
  return json({ ok: true }, 200);
});
