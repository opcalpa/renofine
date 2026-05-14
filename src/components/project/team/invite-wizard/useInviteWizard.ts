import { useCallback, useMemo, useState } from "react";
import type { FeatureAccess } from "../FeatureAccessEditor";
import type {
  ContactInfo,
  InvitePath,
  InviteWizardState,
  MemberAccessConfig,
  PackagePreset,
  ProfessionKey,
  WizardStep,
  WorkerAccessConfig,
} from "./types";
import type { TaskOption, TaskOverride } from "../WorkerInviteFields";
import { applyPackage, detectPackage } from "./packageToAccess";

function ensureOverride(
  map: Map<string, TaskOverride>,
  taskId: string,
): TaskOverride {
  return (
    map.get(taskId) || {
      taskId,
      descriptionOverride: null,
      checklistOverride: null,
      photoOverride: null,
    }
  );
}

const DEFAULT_WORKER_ACCESS: WorkerAccessConfig = {
  taskIds: [],
  canProposePurchases: true,
  canLogPurchases: false,
  taskOverrides: new Map(),
};

const DEFAULT_CONTACT: ContactInfo = {
  name: "",
  email: "",
  phone: "",
  language: "sv",
  welcomeMessage: "",
};

function buildMemberDefault(preset: PackagePreset, onlyAssigned: boolean): MemberAccessConfig {
  const resolvedPreset = preset === "custom" ? "insyn" : preset;
  return {
    preset,
    onlyAssigned,
    access: applyPackage(resolvedPreset, onlyAssigned),
  };
}

interface UseInviteWizardOptions {
  initialPath: InvitePath;
  /** When true, Step 1 is auto-skipped (user entered via a path-specific CTA) */
  skipStep1?: boolean;
}

export function useInviteWizard({ initialPath, skipStep1 = true }: UseInviteWizardOptions) {
  const [state, setState] = useState<InviteWizardState>(() => ({
    step: skipStep1 ? 2 : 1,
    path: initialPath,
    profession: null,
    memberAccess: buildMemberDefault("insyn", false),
    workerAccess: { ...DEFAULT_WORKER_ACCESS },
    contact: { ...DEFAULT_CONTACT },
  }));

  const setPath = useCallback((path: InvitePath) => {
    setState((prev) => {
      if (prev.path === path) return prev;
      return {
        ...prev,
        path,
        memberAccess: buildMemberDefault("insyn", false),
        workerAccess: { ...DEFAULT_WORKER_ACCESS },
      };
    });
  }, []);

  const setProfession = useCallback((profession: ProfessionKey | null) => {
    setState((prev) => ({ ...prev, profession }));
  }, []);

  const setPackagePreset = useCallback((preset: Exclude<PackagePreset, "custom">) => {
    setState((prev) => ({
      ...prev,
      memberAccess: {
        preset,
        onlyAssigned: prev.memberAccess.onlyAssigned,
        access: applyPackage(preset, prev.memberAccess.onlyAssigned),
      },
    }));
  }, []);

  const setOnlyAssigned = useCallback((onlyAssigned: boolean) => {
    setState((prev) => {
      const resolvedPreset = prev.memberAccess.preset === "custom" ? "insyn" : prev.memberAccess.preset;
      const nextAccess = prev.memberAccess.preset === "custom"
        ? {
            ...prev.memberAccess.access,
            tasksScope: onlyAssigned ? "assigned" : "all",
            purchasesScope: onlyAssigned ? "assigned" : "all",
          } as FeatureAccess
        : applyPackage(resolvedPreset, onlyAssigned);

      return {
        ...prev,
        memberAccess: {
          ...prev.memberAccess,
          onlyAssigned,
          access: nextAccess,
        },
      };
    });
  }, []);

  const setAccessField = useCallback((updates: Partial<FeatureAccess>) => {
    setState((prev) => {
      const nextAccess = { ...prev.memberAccess.access, ...updates };
      const detected = detectPackage(nextAccess);
      return {
        ...prev,
        memberAccess: {
          preset: detected,
          onlyAssigned: nextAccess.tasksScope === "assigned",
          access: nextAccess,
        },
      };
    });
  }, []);

  const resetToPackage = useCallback(() => {
    setState((prev) => {
      const fallback = prev.memberAccess.preset === "custom" ? "insyn" : prev.memberAccess.preset;
      return {
        ...prev,
        memberAccess: {
          preset: fallback,
          onlyAssigned: prev.memberAccess.onlyAssigned,
          access: applyPackage(fallback, prev.memberAccess.onlyAssigned),
        },
      };
    });
  }, []);

  const setWorkerAccess = useCallback((updates: Partial<WorkerAccessConfig>) => {
    setState((prev) => ({
      ...prev,
      workerAccess: { ...prev.workerAccess, ...updates },
    }));
  }, []);

  const toggleWorkerTask = useCallback((taskId: string) => {
    setState((prev) => {
      const exists = prev.workerAccess.taskIds.includes(taskId);
      return {
        ...prev,
        workerAccess: {
          ...prev.workerAccess,
          taskIds: exists
            ? prev.workerAccess.taskIds.filter((id) => id !== taskId)
            : [...prev.workerAccess.taskIds, taskId],
        },
      };
    });
  }, []);

  const setWorkerOverride = useCallback(
    (taskId: string, updates: Partial<TaskOverride>) => {
      setState((prev) => {
        const current = ensureOverride(prev.workerAccess.taskOverrides, taskId);
        const next = new Map(prev.workerAccess.taskOverrides);
        next.set(taskId, { ...current, ...updates });
        return {
          ...prev,
          workerAccess: { ...prev.workerAccess, taskOverrides: next },
        };
      });
    },
    [],
  );

  const toggleChecklistItem = useCallback(
    (task: TaskOption, checklistId: string, itemId: string) => {
      setState((prev) => {
        const current = ensureOverride(prev.workerAccess.taskOverrides, task.id);
        const allItems = task.checklists.flatMap((cl) =>
          cl.items.map((item) => ({ checklistId: cl.id, itemId: item.id })),
        );
        const next = new Map(prev.workerAccess.taskOverrides);

        if (!current.checklistOverride) {
          // "all included" → switch to "all minus this one"
          const filtered = allItems.filter(
            (i) => !(i.checklistId === checklistId && i.itemId === itemId),
          );
          next.set(task.id, { ...current, checklistOverride: filtered });
        } else {
          const exists = current.checklistOverride.some(
            (o) => o.checklistId === checklistId && o.itemId === itemId,
          );
          if (exists) {
            const filtered = current.checklistOverride.filter(
              (o) => !(o.checklistId === checklistId && o.itemId === itemId),
            );
            next.set(task.id, { ...current, checklistOverride: filtered });
          } else {
            next.set(task.id, {
              ...current,
              checklistOverride: [
                ...current.checklistOverride,
                { checklistId, itemId },
              ],
            });
          }
        }

        return {
          ...prev,
          workerAccess: { ...prev.workerAccess, taskOverrides: next },
        };
      });
    },
    [],
  );

  const isChecklistItemIncluded = useCallback(
    (taskId: string, checklistId: string, itemId: string): boolean => {
      const override = state.workerAccess.taskOverrides.get(taskId);
      if (!override?.checklistOverride) return true;
      return override.checklistOverride.some(
        (o) => o.checklistId === checklistId && o.itemId === itemId,
      );
    },
    [state.workerAccess.taskOverrides],
  );

  const setContact = useCallback((updates: Partial<ContactInfo>) => {
    setState((prev) => ({ ...prev, contact: { ...prev.contact, ...updates } }));
  }, []);

  const goToStep = useCallback((step: WizardStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const next = useCallback(() => {
    setState((prev) => ({ ...prev, step: Math.min(3, prev.step + 1) as WizardStep }));
  }, []);

  const back = useCallback(() => {
    setState((prev) => ({ ...prev, step: Math.max(1, prev.step - 1) as WizardStep }));
  }, []);

  const canAdvance = useMemo(() => {
    if (state.step === 1) return Boolean(state.path);
    if (state.step === 2) {
      if (state.path === "worker") return state.workerAccess.taskIds.length > 0;
      return true;
    }
    if (state.step === 3) {
      const hasEmail = state.contact.email.trim().length > 0;
      const hasName = state.contact.name.trim().length > 0;
      const hasPhone = state.contact.phone.trim().length > 0;
      if (!hasName) return false;
      if (state.path === "worker") return hasEmail || hasPhone;
      return hasEmail;
    }
    return false;
  }, [state]);

  return {
    state,
    setPath,
    setProfession,
    setPackagePreset,
    setOnlyAssigned,
    setAccessField,
    resetToPackage,
    setWorkerAccess,
    toggleWorkerTask,
    setWorkerOverride,
    toggleChecklistItem,
    isChecklistItemIncluded,
    setContact,
    goToStep,
    next,
    back,
    canAdvance,
  };
}
