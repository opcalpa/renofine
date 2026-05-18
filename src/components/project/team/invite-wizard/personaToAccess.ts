// ============================================================================
// personaToAccess.ts — Renofine v2.2.0
// ============================================================================
// Replaces packageToAccess.ts. Deterministic mapping from
// (persona, mode, scope) → FeatureAccess matrix.
//
// The user never sees the matrix directly in V2 — the wizard exposes only
// persona and mode. This file is the single source of truth for what those
// choices imply.
// ============================================================================

import type { FeatureAccess } from "../FeatureAccessEditor";
import type {
  EconomyMode,
  InvitePersona,
  PmSubType,
  ScopeConfig,
} from "./types";

/** Returns a fully-resolved FeatureAccess given the wizard inputs. */
export function personaToAccess(
  persona: InvitePersona,
  mode: EconomyMode,
  scope: ScopeConfig = { rule: "assigned" },
  pmSubType?: PmSubType | null,
): FeatureAccess {
  // Worker doesn't use FeatureAccess (uses worker_access_tokens instead).
  if (persona === "worker") {
    throw new Error("Worker uses worker_access_tokens, not FeatureAccess");
  }

  // Reviewer (granskare) → read-only across the operational app, zero
  // economy. Can comment (comment access derives from section view), but
  // cannot edit anything. Maps to economy mode "none" downstream.
  if (persona === "reviewer") {
    return {
      customerView: "none",
      timeline: "view",
      tasks: "view",
      tasksScope: "all",
      spacePlanner: "view",
      purchases: "none",
      purchasesScope: "all",
      overview: "view",
      teams: "none",
      budget: "none",
      files: "view",
    };
  }

  // Client → CustomerView, minimal share permissions.
  if (persona === "client") {
    return {
      customerView: "view",
      timeline: "view",
      tasks: "view",
      tasksScope: "all",
      spacePlanner: "view",
      purchases: "none",
      purchasesScope: "all",
      overview: "view",
      teams: "none",
      budget: "view", // Just for CustomerBudgetSection — backend masks markup.
      files: "view",
    };
  }

  const isPM = persona === "pm";

  // Base access — operational.
  const base: FeatureAccess = {
    customerView: isPM ? "view" : "none",
    timeline: "view",
    tasks: "edit",
    tasksScope: scope.rule === "all" ? "all" : "assigned",
    spacePlanner: isPM ? "edit" : "view",
    purchases: "create",
    purchasesScope: scope.rule === "all" ? "all" : "assigned",
    overview: "view",
    teams: isPM ? "view" : "none", // Default member teams:none (fix L2).
    budget: "none",
    files: "upload",
  };

  if (mode === "full") {
    if (!isPM) {
      throw new Error("Mode 'full' only valid for PM/Co-owner");
    }
    return {
      ...base,
      budget: "edit",
      teams: "invite",
      tasksScope: "all",
      purchasesScope: "all",
    };
  }

  if (mode === "own") {
    // budget stays "none"; scopes stay "assigned" — backend filters to created_by.
    return { ...base };
  }

  // mode === "none" — strip all economy.
  return {
    ...base,
    purchases: "view", // Can see (own only) but not log.
    files: scope.rule === "assigned" ? "view" : "upload",
  };
}

// ============================================================================
// Reverse: detect persona+mode from existing FeatureAccess (for editing).
// ============================================================================

export interface DetectedAccess {
  persona: InvitePersona;
  mode: EconomyMode;
  scope: ScopeConfig;
  pmSubType?: PmSubType;
  /** True if no canonical persona+mode matches — user customized manually. */
  isCustom: boolean;
}

export function detectPersonaMode(
  access: FeatureAccess,
  roleType?: string,
): DetectedAccess {
  if (roleType === "client") {
    return { persona: "client", mode: "own", scope: { rule: "all" }, isCustom: false };
  }
  if (roleType === "reviewer") {
    return { persona: "reviewer", mode: "none", scope: { rule: "all" }, isCustom: false };
  }
  if (roleType === "co_owner" || roleType === "pm_hired") {
    const pmSubType: PmSubType = roleType === "co_owner" ? "co_owner" : "pm_hired";
    const mode: EconomyMode =
      access.budget === "edit" ? "full" : access.budget === "view" ? "own" : "none";
    return {
      persona: "pm",
      mode,
      pmSubType,
      scope: { rule: access.tasksScope === "all" ? "all" : "assigned" },
      isCustom: false,
    };
  }

  const mode: EconomyMode =
    access.purchases === "create" || access.purchases === "edit" ? "own" : "none";
  return {
    persona: "member",
    mode,
    scope: { rule: access.tasksScope === "all" ? "all" : "assigned" },
    isCustom: false,
  };
}
