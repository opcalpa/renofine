import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the current authenticated user's profile id (null until resolved or
 * when signed out). Comments and other author-scoped records store the profile
 * id in `created_by_user_id`, so ownership checks compare against this value.
 */
export function useCurrentProfileId(): string | null {
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (active && profile) setProfileId(profile.id);
    })();
    return () => {
      active = false;
    };
  }, []);

  return profileId;
}
