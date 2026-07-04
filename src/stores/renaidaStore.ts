/**
 * Lightweight store for Renaida assistant state.
 * Used to pass project reminder data from OverviewTab to the global Renaida component.
 */
import { create } from "zustand";
import type { ProjectReminder } from "@/hooks/useProjectReminders";

interface RenaidaStoreState {
  reminderCount: number;
  reminders: ProjectReminder[];
  projectId: string | null;
  projectName: string | null;
  projectCountry: string | null;
  setReminders: (reminders: ProjectReminder[], projectId?: string, projectName?: string, projectCountry?: string) => void;
  clear: () => void;
}

export const useRenaidaStore = create<RenaidaStoreState>((set) => ({
  reminderCount: 0,
  reminders: [],
  projectId: null,
  projectName: null,
  projectCountry: null,
  setReminders: (reminders, projectId, projectName, projectCountry) =>
    set({
      reminders,
      reminderCount: reminders.length,
      projectId: projectId ?? null,
      projectName: projectName ?? null,
      projectCountry: projectCountry ?? null,
    }),
  clear: () => set({ reminders: [], reminderCount: 0, projectId: null, projectName: null, projectCountry: null }),
}));
