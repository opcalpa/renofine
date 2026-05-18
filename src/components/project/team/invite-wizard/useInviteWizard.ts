import { useCallback, useMemo, useState } from "react";
import type {
  ContactInfo,
  EconomyMode,
  InstructionImage,
  InvitePersona,
  InviteWizardState,
  PmSubType,
  ProfessionKey,
  ScopeConfig,
  WizardStep,
  WorkerAccessConfig,
} from "./types";
import type { TaskOption, TaskOverride } from "../WorkerInviteFields";

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
  instructionImages: new Map(),
};

const DEFAULT_CONTACT: ContactInfo = {
  name: "",
  email: "",
  phone: "",
  language: "sv",
  welcomeMessage: "",
};

/** Persona-appropriate default economy mode. */
function defaultModeFor(persona: InvitePersona): EconomyMode {
  if (persona === "pm") return "full";
  if (persona === "client") return "own";
  if (persona === "reviewer") return "none"; // no economy (mode unused)
  return "own"; // member → Egna by default
}

export interface WorkerPrefill {
  name?: string;
  phone?: string;
  email?: string;
  language?: string;
  welcomeMessage?: string;
  taskIds?: string[];
  canProposePurchases?: boolean;
  canLogPurchases?: boolean;
  /** When set, the revoked token being re-invited — replaced on submit. */
  replacesTokenId?: string;
}

interface UseInviteWizardOptions {
  initialPersona: InvitePersona;
  /** When true, Step 1 (persona picker) is auto-skipped. */
  skipStep1?: boolean;
  /** Optional pre-fill for the worker flow (used by reinvite). */
  prefillWorker?: WorkerPrefill;
}

export function useInviteWizard({
  initialPersona,
  skipStep1 = false,
  prefillWorker,
}: UseInviteWizardOptions) {
  const minStep: WizardStep = skipStep1 ? 2 : 1;

  const [state, setState] = useState<InviteWizardState>(() => ({
    step: skipStep1 ? 2 : 1,
    persona: initialPersona,
    profession: null,
    mode: defaultModeFor(initialPersona),
    scope: { rule: "assigned" },
    pmSubType: initialPersona === "pm" ? "co_owner" : null,
    expiresAt: null,
    workerAccess: prefillWorker
      ? {
          ...DEFAULT_WORKER_ACCESS,
          taskIds: prefillWorker.taskIds ?? [],
          canProposePurchases:
            prefillWorker.canProposePurchases ?? DEFAULT_WORKER_ACCESS.canProposePurchases,
          canLogPurchases:
            prefillWorker.canLogPurchases ?? DEFAULT_WORKER_ACCESS.canLogPurchases,
          taskOverrides: new Map(),
        }
      : { ...DEFAULT_WORKER_ACCESS, taskOverrides: new Map() },
    contact: prefillWorker
      ? {
          ...DEFAULT_CONTACT,
          name: prefillWorker.name ?? "",
          phone: prefillWorker.phone ?? "",
          email: prefillWorker.email ?? "",
          language: prefillWorker.language ?? DEFAULT_CONTACT.language,
          welcomeMessage: prefillWorker.welcomeMessage ?? "",
        }
      : { ...DEFAULT_CONTACT },
  }));

  const setPersona = useCallback((persona: InvitePersona) => {
    setState((prev) => {
      if (prev.persona === persona) return prev;
      return {
        ...prev,
        persona,
        mode: defaultModeFor(persona),
        scope: { rule: "assigned" },
        pmSubType: persona === "pm" ? "co_owner" : null,
        expiresAt: null,
      };
    });
  }, []);

  const setProfession = useCallback((profession: ProfessionKey | null) => {
    setState((prev) => ({ ...prev, profession }));
  }, []);

  const setMode = useCallback((mode: EconomyMode) => {
    setState((prev) => ({ ...prev, mode }));
  }, []);

  const setScope = useCallback((scope: ScopeConfig) => {
    setState((prev) => ({ ...prev, scope }));
  }, []);

  const setPmSubType = useCallback((pmSubType: PmSubType) => {
    setState((prev) => ({ ...prev, pmSubType }));
  }, []);

  const setExpiresAt = useCallback((expiresAt: string | null) => {
    setState((prev) => ({ ...prev, expiresAt }));
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

  const addInstructionImage = useCallback(
    (taskId: string, image: InstructionImage) => {
      setState((prev) => {
        const next = new Map(prev.workerAccess.instructionImages);
        const existing = next.get(taskId) ?? [];
        next.set(taskId, [...existing, image]);
        return {
          ...prev,
          workerAccess: { ...prev.workerAccess, instructionImages: next },
        };
      });
    },
    [],
  );

  const updateInstructionImage = useCallback(
    (taskId: string, localId: string, updates: Partial<InstructionImage>) => {
      setState((prev) => {
        const existing = prev.workerAccess.instructionImages.get(taskId);
        if (!existing) return prev;
        const next = new Map(prev.workerAccess.instructionImages);
        next.set(
          taskId,
          existing.map((img) =>
            img.localId === localId ? { ...img, ...updates } : img,
          ),
        );
        return {
          ...prev,
          workerAccess: { ...prev.workerAccess, instructionImages: next },
        };
      });
    },
    [],
  );

  const removeInstructionImage = useCallback(
    (taskId: string, localId: string) => {
      setState((prev) => {
        const existing = prev.workerAccess.instructionImages.get(taskId);
        if (!existing) return prev;
        const next = new Map(prev.workerAccess.instructionImages);
        const filtered = existing.filter((img) => img.localId !== localId);
        if (filtered.length === 0) next.delete(taskId);
        else next.set(taskId, filtered);
        return {
          ...prev,
          workerAccess: { ...prev.workerAccess, instructionImages: next },
        };
      });
    },
    [],
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
    setState((prev) => ({
      ...prev,
      step: Math.max(minStep, prev.step - 1) as WizardStep,
    }));
  }, [minStep]);

  const canAdvance = useMemo(() => {
    if (state.step === 1) return Boolean(state.persona);
    if (state.step === 2) {
      if (state.persona === "worker") return state.workerAccess.taskIds.length > 0;
      return true;
    }
    if (state.step === 3) {
      const hasEmail = state.contact.email.trim().length > 0;
      const hasName = state.contact.name.trim().length > 0;
      const hasPhone = state.contact.phone.trim().length > 0;
      if (!hasName) return false;
      if (state.persona === "worker") return hasEmail || hasPhone;
      return hasEmail;
    }
    return false;
  }, [state]);

  return {
    state,
    minStep,
    setPersona,
    setProfession,
    setMode,
    setScope,
    setPmSubType,
    setExpiresAt,
    setWorkerAccess,
    toggleWorkerTask,
    setWorkerOverride,
    toggleChecklistItem,
    isChecklistItemIncluded,
    addInstructionImage,
    updateInstructionImage,
    removeInstructionImage,
    setContact,
    goToStep,
    next,
    back,
    canAdvance,
  };
}
