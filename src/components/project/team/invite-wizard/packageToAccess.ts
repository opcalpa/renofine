import type { FeatureAccess } from "../FeatureAccessEditor";
import type { PackagePreset } from "./types";

export function applyPackage(
  preset: PackagePreset,
  onlyAssigned: boolean,
): FeatureAccess {
  if (preset === "custom") {
    throw new Error("applyPackage cannot resolve a custom preset; pass concrete values instead");
  }

  const level = preset === "insyn" ? "view" : "edit";
  const purchasesLevel = preset === "insyn" ? "view" : "create";
  const filesLevel = preset === "insyn" ? "view" : "upload";
  const teamsLevel = preset === "insyn" ? "view" : "view";
  const scope = onlyAssigned ? "assigned" : "all";

  return {
    customerView: "view",
    timeline: level,
    tasks: level,
    tasksScope: scope,
    spacePlanner: level,
    purchases: purchasesLevel,
    purchasesScope: scope,
    overview: level,
    teams: teamsLevel,
    budget: preset === "insyn" ? "view" : "edit",
    files: filesLevel,
  };
}

export function detectPackage(access: FeatureAccess): PackagePreset {
  const insynReference = applyPackage("insyn", access.tasksScope === "assigned");
  const aktivReference = applyPackage("aktiv", access.tasksScope === "assigned");

  if (deepEqual(access, insynReference)) return "insyn";
  if (deepEqual(access, aktivReference)) return "aktiv";
  return "custom";
}

export function diffCount(
  access: FeatureAccess,
  preset: Exclude<PackagePreset, "custom">,
  onlyAssigned: boolean,
): number {
  const reference = applyPackage(preset, onlyAssigned);
  let count = 0;
  (Object.keys(reference) as Array<keyof FeatureAccess>).forEach((key) => {
    if (access[key] !== reference[key]) count += 1;
  });
  return count;
}

function deepEqual(a: FeatureAccess, b: FeatureAccess): boolean {
  return (Object.keys(a) as Array<keyof FeatureAccess>).every((k) => a[k] === b[k]);
}
