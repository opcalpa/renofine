// Minimal client-side feature gating. No central flag service exists yet;
// this keeps risky in-progress work off by default in prod while allowing
// per-browser opt-in for verification.
//
// A flag is ON if EITHER:
//   - build env sets VITE_<FLAG>=true, or
//   - localStorage has rf_flag_<flag> === "true" (per-browser override)

function readLocalOverride(key: string): boolean {
  try {
    return localStorage.getItem(`rf_flag_${key}`) === "true";
  } catch {
    return false;
  }
}

/**
 * Team v2 DB field-masking: route reads through the masking RPCs / service
 * layer. OFF by default — flip per-browser with:
 *   localStorage.setItem('rf_flag_team_v2_masking', 'true')
 */
export function isTeamV2MaskingEnabled(): boolean {
  return (
    import.meta.env.VITE_TEAM_V2_MASKING === "true" ||
    readLocalOverride("team_v2_masking")
  );
}
