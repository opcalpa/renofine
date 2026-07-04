/**
 * Lightweight store for Renaida assistant state.
 * Used to pass project reminder data from OverviewTab to the global Renaida component.
 */
import { create } from "zustand";
import type { ProjectReminder } from "@/hooks/useProjectReminders";

/**
 * How much Renaida is allowed to do on her own (progressive trust, Fas 2).
 * - "suggest": always confirm via ConfirmDiff (default, safest).
 * - "autopilot": apply high-confidence single actions immediately, with Undo.
 * Persisted per-user in renaida_user_memory; synced across devices.
 */
export type RenaidaAutonomy = "suggest" | "autopilot";

/** Instant first-paint cache of the synced preference (device-local mirror). */
const AUTONOMY_CACHE_KEY = "renaida-autonomy";
function cachedAutonomy(): RenaidaAutonomy {
  if (typeof localStorage === "undefined") return "suggest";
  return localStorage.getItem(AUTONOMY_CACHE_KEY) === "autopilot" ? "autopilot" : "suggest";
}

interface RenaidaStoreState {
  reminderCount: number;
  reminders: ProjectReminder[];
  projectId: string | null;
  projectName: string | null;
  projectCountry: string | null;
  autonomy: RenaidaAutonomy;
  setReminders: (reminders: ProjectReminder[], projectId?: string, projectName?: string, projectCountry?: string) => void;
  setAutonomy: (mode: RenaidaAutonomy) => void;
  clear: () => void;
}

export const useRenaidaStore = create<RenaidaStoreState>((set) => ({
  reminderCount: 0,
  reminders: [],
  projectId: null,
  projectName: null,
  projectCountry: null,
  autonomy: cachedAutonomy(),
  setReminders: (reminders, projectId, projectName, projectCountry) =>
    set({
      reminders,
      reminderCount: reminders.length,
      projectId: projectId ?? null,
      projectName: projectName ?? null,
      projectCountry: projectCountry ?? null,
    }),
  setAutonomy: (mode) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(AUTONOMY_CACHE_KEY, mode);
    set({ autonomy: mode });
  },
  // clear() runs on project unmount — keep autonomy (it's a user-level preference).
  clear: () => set({ reminders: [], reminderCount: 0, projectId: null, projectName: null, projectCountry: null }),
}));
