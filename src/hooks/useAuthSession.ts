import { useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { analytics, AnalyticsEvents } from '@/lib/analytics';

interface AuthSession {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

/**
 * Hook for managing authenticated user sessions with automatic refresh
 * Sessions persist for up to 7 days (168 hours) via Supabase's built-in token refresh
 */
export const useAuthSession = (): AuthSession => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener first to catch all events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setLoading(false);

        // Hydrate view preferences from server on sign in
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          import('./usePersistedPreference').then(m => m.hydratePreferencesFromServer());
        }

        // Identify user in analytics when they sign in
        if (event === 'SIGNED_IN' && currentSession?.user) {
          analytics.identify(currentSession.user.id, {
            email_domain: currentSession.user.email?.split('@')[1],
            auth_provider: currentSession.user.app_metadata?.provider,
          });

          // Track new OAuth signups. Email signups are captured explicitly in
          // Auth.tsx (their email-confirmation flow never reaches SIGNED_IN),
          // so we only count non-email providers here to avoid double-counting.
          // A brand-new account has created_at within the last ~2 minutes;
          // returning logins have an older created_at and are skipped.
          const provider = currentSession.user.app_metadata?.provider;
          const createdAt = new Date(currentSession.user.created_at).getTime();
          if (provider && provider !== 'email' && Date.now() - createdAt < 120_000) {
            analytics.capture(AnalyticsEvents.SIGNUP_COMPLETED, {
              auth_provider: provider,
            });
          }
        }

        // Reset analytics on sign out
        if (event === 'SIGNED_OUT') {
          analytics.reset();
        }
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return { user, session, loading, signOut };
};
