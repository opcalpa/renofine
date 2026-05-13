import type { FeatureAccess } from "../FeatureAccessEditor";

export type AreaKey = "tasks" | "purchases" | "budget" | "files";
export type AreaLevel = "stangd" | "insyn" | "aktiv";

export const AREAS: AreaKey[] = ["tasks", "purchases", "budget", "files"];

/**
 * Maps a user-facing 3-level value to the schema's `*_access` string.
 * "Aktiv" maps differently per area: tasks/budget→edit, purchases→create, files→upload.
 */
export function levelToAccess(area: AreaKey, level: AreaLevel): string {
  if (level === "stangd") return "none";
  if (level === "insyn") return "view";
  switch (area) {
    case "tasks":
    case "budget":
      return "edit";
    case "purchases":
      return "create";
    case "files":
      return "upload";
  }
}

export function accessToLevel(value: string): AreaLevel {
  if (value === "none") return "stangd";
  if (value === "view") return "insyn";
  return "aktiv";
}

export function getAreaAccessField(area: AreaKey): keyof FeatureAccess {
  switch (area) {
    case "tasks":
      return "tasks";
    case "purchases":
      return "purchases";
    case "budget":
      return "budget";
    case "files":
      return "files";
  }
}

export function readAreaLevel(area: AreaKey, access: FeatureAccess): AreaLevel {
  const field = getAreaAccessField(area);
  return accessToLevel(access[field] as string);
}
