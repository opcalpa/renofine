import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";

/**
 * Returns whether the current user is a professional (builder/contractor).
 *
 * Canonical signal: `profiles.onboarding_user_type === 'contractor'`. This is
 * the value the top-level Hemägare/Professionell toggle in Profile settings
 * writes, and is the ONLY source of truth for feature-gating (markup, budget
 * layout, planning table layout, generate-quote vs request-quote, etc.).
 *
 * `profiles.is_professional` is intentionally NOT consulted here — it is
 * reserved for a future marketplace/directory feature (be discoverable as
 * a service provider). Mixing it into role-gating leads to surprising UX
 * where features appear/disappear independently of the visible toggle.
 */
export function useIsProfessional() {
  const { user } = useAuthSession();
  const [isProfessional, setIsProfessional] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsProfessional(false);
      setLoading(false);
      return;
    }
    supabase
      .from("profiles")
      .select("onboarding_user_type")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setIsProfessional(data?.onboarding_user_type === "contractor");
        setLoading(false);
      });
  }, [user]);

  return { isProfessional, loading };
}
