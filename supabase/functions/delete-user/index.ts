// delete-user — true account deletion for the super_admin.
//
// WHY THIS EXISTS: deleting a row from public.user_profiles does NOT
// delete the person's login. The login lives in auth.users and can only
// be removed through the Auth Admin API, which needs the service-role
// key. That key must never ship in the app, so this Edge Function is
// the only place it is used: it runs server-side, where
// SUPABASE_SERVICE_ROLE_KEY is provided automatically by the platform.
//
// CALLER RULES:
//   * The caller must be signed in (their JWT is in the Authorization
//     header) and their public.user_profiles.role must be
//     'super_admin'. Everyone else gets 401/403.
//
// REQUEST:  POST { "user_id": "<auth user id to delete>" }
// RESPONSE: 200 { "ok": true }
//           4xx { "error": "<plain-language reason>" }
//
// ORGANIZATION SAFETY: sub_accounts belong to organizations
// (sub_accounts.organization_id -> organizations.id), and organizations
// belong to managers (organizations.manager_id -> auth.users). Deleting
// a manager who still has students would strand those student accounts
// (or cascade in ways the admin did not choose), so this function
// REFUSES while the target user owns an organization that still has
// sub_accounts — the admin must reassign or delete those students
// first. An organization with NO students is removed along with the
// user (explicitly, here, so nothing depends on FK cascade settings).
//
// The target's own public.user_profiles row is removed by the
// user_profiles.id -> auth.users.id foreign key cascade when the auth
// user is deleted; a best-effort explicit delete afterwards covers the
// (unexpected) case where the cascade is not configured.

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // 1. Who is calling? Resolve the user from their JWT.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) {
    return json({ error: 'You must be signed in to delete accounts.' }, 401);
  }
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData?.user) {
    return json({ error: 'You must be signed in to delete accounts.' }, 401);
  }
  const callerId = callerData.user.id;

  // Service-role client: bypasses row-level security, so every check
  // below is done explicitly in this function.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // 2. Only the super_admin may delete accounts.
  const { data: callerProfile, error: profileError } = await admin
    .from('user_profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  if (profileError) {
    return json({ error: `Could not verify your permissions: ${profileError.message}` }, 500);
  }
  if (callerProfile?.role !== 'super_admin') {
    return json({ error: 'Only the super admin can delete accounts.' }, 403);
  }

  // 3. Who is being deleted?
  let userId = '';
  try {
    const body = await req.json();
    userId = typeof body?.user_id === 'string' ? body.user_id : '';
  } catch {
    return json({ error: 'Request body must be JSON with a user_id.' }, 400);
  }
  if (!userId) {
    return json({ error: 'Missing user_id.' }, 400);
  }
  if (userId === callerId) {
    return json({ error: 'You cannot delete your own admin account.' }, 400);
  }

  // 4. Organization guard: refuse while the user owns an organization
  //    that still has students (see the header note).
  const { data: orgs, error: orgError } = await admin
    .from('organizations')
    .select('id, name')
    .eq('manager_id', userId);
  if (orgError) {
    return json({ error: `Could not check the user's organizations: ${orgError.message}` }, 500);
  }
  const ownedOrgs = orgs ?? [];
  if (ownedOrgs.length > 0) {
    const { count, error: countError } = await admin
      .from('sub_accounts')
      .select('id', { count: 'exact', head: true })
      .in('organization_id', ownedOrgs.map((o) => o.id));
    if (countError) {
      return json({ error: `Could not check the user's students: ${countError.message}` }, 500);
    }
    if ((count ?? 0) > 0) {
      return json(
        {
          error:
            `This user manages ${count} student account(s) in ` +
            `${ownedOrgs.map((o) => `"${o.name}"`).join(', ')}. ` +
            'Reassign or delete those students first, then delete this account.',
        },
        409,
      );
    }
    // Empty organizations only: remove them explicitly so the account
    // deletion never depends on FK cascade configuration.
    const { error: orgDeleteError } = await admin
      .from('organizations')
      .delete()
      .eq('manager_id', userId);
    if (orgDeleteError) {
      return json({ error: `Could not remove the user's empty organizations: ${orgDeleteError.message}` }, 500);
    }
  }

  // 5. Delete the login itself via the Auth Admin API. The
  //    user_profiles row follows via its FK cascade to auth.users.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return json({ error: `Account deletion failed: ${deleteError.message}` }, 500);
  }

  // Best-effort cleanup in case the profile FK has no cascade.
  await admin.from('user_profiles').delete().eq('id', userId);

  return json({ ok: true }, 200);
});
