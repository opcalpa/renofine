/**
 * Lightweight store for Renaida assistant state.
 * Used to pass project reminder data from OverviewTab to the global Renaida component.
 */
import { create } from "zustand";
import type { ProjectReminder } from "@/hooks/useProjectReminders";
import type { ImportSession } from "@/services/agent/importSession";

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
  /** Panel open-state lives here so ANY surface (FAB, mobile nav slot, a future
   *  share-target route) can open Renaida — not just her own floating button. */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  /** Files handed over by the PWA share-target (/capture) — the panel consumes
   *  them through the same D1 document flow as the paperclip button. */
  pendingShareFiles: File[] | null;
  setPendingShareFiles: (files: File[] | null) => void;
  /**
   * A whole folder dropped on an existing project. Too big a decision for the
   * panel (is this `Badrum 1` the `Badrum` you already have?), so it is handed
   * to the import review page instead. Lives until applied or cancelled.
   */
  importSession: ImportSession | null;
  setImportSession: (session: ImportSession | null) => void;
  /** Project identity — owned by ProjectDetail (lives for the whole project visit,
   *  across tab switches). Voice capture/apply/proactive all key off projectId. */
  setProject: (projectId: string, projectName?: string | null, projectCountry?: string | null) => void;
  clearProject: () => void;
  /** Reminders — owned by OverviewTab (only mounted on the overview tab). */
  setReminders: (reminders: ProjectReminder[]) => void;
  setAutonomy: (mode: RenaidaAutonomy) => void;
}

export const useRenaidaStore = create<RenaidaStoreState>((set) => ({
  reminderCount: 0,
  reminders: [],
  projectId: null,
  projectName: null,
  projectCountry: null,
  autonomy: cachedAutonomy(),
  panelOpen: false,
  setPanelOpen: (open) => set({ panelOpen: open }),
  pendingShareFiles: null,
  setPendingShareFiles: (files) => set({ pendingShareFiles: files }),
  importSession: null,
  setImportSession: (session) => set({ importSession: session }),
  setProject: (projectId, projectName, projectCountry) =>
    set({ projectId, projectName: projectName ?? null, projectCountry: projectCountry ?? null }),
  clearProject: () =>
    set({ projectId: null, projectName: null, projectCountry: null, reminders: [], reminderCount: 0 }),
  setReminders: (reminders) =>
    set({ reminders, reminderCount: reminders.length }),
  setAutonomy: (mode) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(AUTONOMY_CACHE_KEY, mode);
    set({ autonomy: mode });
  },
}));
