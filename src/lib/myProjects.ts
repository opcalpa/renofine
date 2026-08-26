/**
 * The projects to OFFER someone in a picker.
 *
 * `projects`-policyn börjar med `is_system_admin() OR …`, så en systemadmin når
 * varje projekt i databasen. Det är avsiktligt för admin-vyn — men en
 * projektväljare i ett vardagsflöde ska aldrig ärva det. Carl såg 25 projekt i
 * mapp-släppet, varav 22 tillhörde andra (2026-08-26).
 *
 * Regeln bor i databasen (`my_project_ids()`): äger, är delad med, eller når via
 * adressen — utan admin-bypassen. Den här filen är bara vägen dit, så nästa
 * väljare som byggs har ett självklart ställe att fråga.
 *
 * FAIL CLOSED: går uppslaget fel returneras en tom lista, inte "visa allt".
 * En tom väljare är ett synligt fel; en väljare full av främmande projekt är
 * ett osynligt.
 */

import { supabase } from '@/integrations/supabase/client';

export async function myProjectIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc('my_project_ids');
  if (error) {
    console.error('Failed to resolve own projects:', error);
    return [];
  }
  return (data as unknown as string[]) ?? [];
}
