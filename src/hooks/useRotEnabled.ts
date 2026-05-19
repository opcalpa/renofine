import { useMarket } from "./useMarket";
import { useEnabledModules } from "./useEnabledModules";
import type { ProfileSize } from "@/lib/modules";

/**
 * Whether Swedish ROT (renovation tax deduction) UI should be shown.
 *
 * Viewer-scoped: resolves the *current user's own* market. Do NOT use
 * this to gate shared documents (quote/invoice public links) — there the
 * relevant market is the project owner's, not whoever opens the link, so
 * gating by viewer market would wrongly hide a Swedish contractor's ROT
 * line from a foreign client.
 */
export function useRotEnabled(profileSize: ProfileSize = "homeowner"): boolean {
  const [market] = useMarket();
  const { isSectionEnabled } = useEnabledModules(profileSize, market);
  return isSectionEnabled("rot");
}
