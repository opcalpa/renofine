/**
 * Auto-suggest which room task a room_item belongs to, so a placed object is
 * scoped to the right work (the electrician sees their outlets, not the
 * painter's). Matching bridges the trade axis to the estimation labour axis:
 * an item's category → its work-type (workCategories) is compared against each
 * room task's detected work-type (materialRecipes.detectWorkType).
 *
 * Deliberately conservative: only links when EXACTLY ONE room task matches the
 * trade. No match or an ambiguous several → left unassigned (room-wide, as
 * before), and the owner can always override manually in room details.
 */

import { supabase } from '@/integrations/supabase/client';
import { detectWorkType } from '@/lib/materialRecipes';
import { workCategoryToWorkType } from '@/lib/workCategories';

export interface TaskLite {
  id: string;
  title: string;
  cost_center?: string | null;
}

/** The single task whose work-type matches the item's trade, or null. */
export function matchTaskForCategory(category: string, tasks: TaskLite[]): string | null {
  const wt = workCategoryToWorkType(category);
  if (!wt) return null;
  const matches = tasks.filter(
    (tk) => detectWorkType({ title: tk.title, cost_center: tk.cost_center ?? null }) === wt
  );
  return matches.length === 1 ? matches[0].id : null;
}

/**
 * Fetch the given room's tasks and resolve the auto-linked task for a category.
 * Fire-and-forget safe: returns null on any error. Used at canvas placement,
 * where the room's tasks aren't already loaded in memory.
 */
export async function resolveTaskForRoomItem(
  roomId: string,
  category: string
): Promise<string | null> {
  if (!workCategoryToWorkType(category)) return null;
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, cost_center, room_id, room_ids')
    .or(`room_id.eq.${roomId},room_ids.cs.{${roomId}}`);
  if (error || !data) return null;
  return matchTaskForCategory(category, data as TaskLite[]);
}
