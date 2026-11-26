import { rememberSavedAccount } from './savedAccounts';
import { supabase } from './supabase';

/**
 * If a Supabase (email / Google) session already exists on this device,
 * send the user to the home for their role and return true. Returns
 * false when there is no session, so the caller keeps showing its page.
 *
 * This is what makes the Google sign-in return work: Supabase sends the
 * browser back to the site root with the session in the URL, supabase-js
 * stores it (detectSessionInUrl on web), and the landing page calls this
 * on mount to route the now-signed-in user onward instead of leaving
 * them sitting on the public page looking logged out.
 *
 * PIN students are unaffected: they have no Supabase session (their
 * session lives in AsyncStorage), so getSession() is null for them.
 */
export async function routeSignedInUser(
  replace: (path: '/admin' | '/manager' | '/learner') => void,
): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return false;

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, display_name')
      .eq('id', session.user.id)
      .single();

    // Switch Account (Round 81): a Google sign-in lands back here
    // rather than in the login form, so remember learner accounts on
    // this path too — identifier only, never a credential.
    if (profile?.role === 'individual_learner' && session.user.email) {
      await rememberSavedAccount({
        kind: 'auth',
        displayName:
          (profile.display_name as string | null) ||
          session.user.email.split('@')[0] ||
          session.user.email,
        identifier: session.user.email.toLowerCase(),
      });
    }

    if (profile?.role === 'super_admin' || profile?.role === 'content_manager') {
      replace('/admin');
    } else if (profile?.role === 'manager') {
      replace('/manager');
    } else {
      replace('/learner');
    }
    return true;
  } catch {
    return false;
  }
}
