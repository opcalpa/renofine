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
import type { WorkType } from './workTypeUtils';
import { getWorkTypes } from './workTypeUtils';

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

export interface AddonSuggestion {
  label: string;
  workType: WorkType;
}

/**
 * LLM-generated add-on suggestions for the guided flow. Returns [] on any
 * failure so the caller falls back to the curated deterministic list.
 */
export async function fetchAddonSuggestions(params: {
  projectType: string;
  rooms: string[];
  existingWorkTypes: string[];
  language: string;
  userType: string;
}): Promise<AddonSuggestion[]> {
  const known = new Set<WorkType>(getWorkTypes().map((w) => w.value));
  try {
    const { data, error } = await supabase.functions.invoke('renaida-suggest', { body: params });
    if (error || !data || !Array.isArray(data.suggestions)) return [];
    return (data.suggestions as Array<{ label?: unknown; workType?: unknown }>)
      .filter(
        (s): s is AddonSuggestion =>
          typeof s.label === 'string' &&
          !!s.label.trim() &&
          typeof s.workType === 'string' &&
          known.has(s.workType as WorkType)
      )
      .slice(0, 6);
  } catch {
    return [];
  }
}

export interface CriticFlagSuggestion {
  label: string;
  workType: WorkType;
  roomName: string | null;
  reason?: string;
}

/**
 * Fas C+ critic: ONE LLM pass over the merged draft flagging genuinely missing
 * critical work. Returns [] on any failure — the flow silently skips the step
 * (fail-open, an empty check is a good answer).
 */
export async function fetchCriticFlags(params: {
  projectType: string;
  rooms: Array<{ name: string; areaSqm?: number | null }>;
  tasks: Array<{ workType: string; roomName?: string | null; title?: string | null }>;
  language: string;
  userType: string;
}): Promise<CriticFlagSuggestion[]> {
  const known = new Set<WorkType>(getWorkTypes().map((w) => w.value));
  try {
    const { data, error } = await supabase.functions.invoke('renaida-critic', { body: params });
    if (error || !data || !Array.isArray(data.flags)) return [];
    return (data.flags as Array<{ label?: unknown; workType?: unknown; roomName?: unknown; reason?: unknown }>)
      .filter(
        (f): f is { label: string; workType: string; roomName?: string | null; reason?: string } =>
          typeof f.label === 'string' &&
          !!f.label.trim() &&
          typeof f.workType === 'string' &&
          known.has(f.workType as WorkType)
      )
      .map((f) => ({
        label: f.label.trim(),
        workType: f.workType as WorkType,
        roomName: typeof f.roomName === 'string' && f.roomName.trim() ? f.roomName.trim() : null,
        reason: typeof f.reason === 'string' && f.reason.trim() ? f.reason.trim() : undefined,
      }))
      .slice(0, 3);
  } catch {
    return [];
  }
}
