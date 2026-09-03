import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_ROT_CAPACITY,
  ROT_DEFAULT_YEARLY_LIMIT,
  rotCapacity,
  type RotCapacity,
} from "@/lib/rot";

/**
 * Projektets ROT-utrymme — vilka personer som delar avdraget, och vilket tak
 * som gäller för året.
 *
 * Datan fanns redan (`project_rot_persons`, `rot_yearly_limits`) och lästes av
 * budgetvyerna; den här funktionen gör den nåbar också för offerter, fakturor
 * och PDF-exporterna, som fram till nu räknade utan tak.
 *
 * Fel sväljs med flit: ett dokument ska renderas även när uppslaget fallerar,
 * och defaulten (en person, årets tak) underskattar hellre avdraget än
 * överskattar det.
 */
export async function fetchRotCapacity(
  projectId: string | null | undefined,
  year: number = new Date().getFullYear(),
): Promise<RotCapacity> {
  if (!projectId) return DEFAULT_ROT_CAPACITY;
  try {
    const [personsRes, limitRes] = await Promise.all([
      supabase
        .from("project_rot_persons")
        .select("name, personnummer, custom_yearly_limit")
        .eq("project_id", projectId),
      supabase
        .from("rot_yearly_limits")
        .select("max_amount_per_person")
        .eq("year", year)
        .maybeSingle(),
    ]);
    const defaultLimit =
      limitRes.data?.max_amount_per_person ?? ROT_DEFAULT_YEARLY_LIMIT;
    return rotCapacity(personsRes.data, defaultLimit);
  } catch {
    return DEFAULT_ROT_CAPACITY;
  }
}
