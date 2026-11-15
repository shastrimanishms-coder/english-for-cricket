import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type RoleGuardStatus = 'checking' | 'authorized';

// The single home route per role - mirrors the routing decisions made in
// login.tsx after a successful email sign-in.
function homeRouteForRole(role: string | null | undefined) {
  if (role === 'super_admin') return '/admin' as const;
  if (role === 'manager') return '/manager' as const;
  return '/learner' as const;
}

/**
 * Client-side route guard for role-restricted areas (defense in depth -
 * Supabase RLS remains the real enforcement on the data itself).
 *
 * Usage: const guardStatus = useRequireRole(['super_admin']);
 * Render nothing but a loading indicator until it returns 'authorized'.
 *
 * How it decides, mirroring login.tsx:
 * - No Supabase session -> redirect to /login. (PIN students have no
 *   Supabase session, so they are kept out of admin/manager areas too,
 *   while their own learner flow - driven by the AsyncStorage
 *   'student_session' blob - is never touched by this hook.)
 * - Session + user_profiles.role in allowedRoles -> 'authorized'.
 * - Session + any other role -> redirect to that role's own home route.
 */
export function useRequireRole(allowedRoles: string[]): RoleGuardStatus {
  const router = useRouter();
  const [status, setStatus] = useState<RoleGuardStatus>('checking');
  // Join the roles so the effect dependency stays stable even when callers
  // pass an inline array literal.
  const rolesKey = allowedRoles.join('|');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session) {
        router.replace('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      if (cancelled) return;

      const role = profile?.role as string | undefined;
      if (role && rolesKey.split('|').includes(role)) {
        setStatus('authorized');
      } else {
        router.replace(homeRouteForRole(role));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rolesKey, router]);

  return status;
}
