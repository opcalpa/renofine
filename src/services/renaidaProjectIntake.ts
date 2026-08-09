/**
 * Renaida project intake — the network side of the LLM jumpstart.
 *
 * Reuses the deployed, language-aware `parse-renovation-description` edge
 * function to understand a free-text project description. The pure mapping of
 * the result onto the draft lives in renaidaProjectFlow.ts (seedDraftFromParse)
 * so it can be unit-tested without pulling in the Supabase client.
 */

import { supabase } from '@/integrations/supabase/client';
import type { AIParsedResult } from '@/components/project/overview/planning-wizard/types';

/** Call the deployed parser. Returns null on any failure (UI falls back to Q&A). */
export async function parseProjectDescription(
  description: string,
  language: string
): Promise<AIParsedResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('parse-renovation-description', {
      body: { description, language },
    });
    if (error || !data || !Array.isArray(data.rooms)) return null;
    return data as AIParsedResult;
  } catch {
    return null;
  }
}
