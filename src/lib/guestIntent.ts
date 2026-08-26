/**
 * What the visitor said on the landing page, carried into the app.
 *
 * The landing page and `/start` are separate routes, so the sentence a visitor
 * types in the hero ("måla om vardagsrummet och lägga nytt golv") has to survive
 * one navigation. localStorage is the same channel `guest_user_type` already
 * travels on, so this adds a mechanism rather than inventing one.
 *
 * It is deliberately WRITE-ONCE-READ-ONCE: `takeGuestIntent` clears as it reads,
 * so a returning visitor never gets last week's sentence replayed into a fresh
 * wizard. A stale intent that reopens the wizard by itself would be worse than
 * no intent at all.
 */

const KEY = 'renofine_guest_intent';

export interface GuestIntent {
  /** Free text the visitor typed, or the preset label they tapped. */
  description: string;
  /** Which preset box was used, for the funnel breakdown. Null when typed. */
  preset: string | null;
}

export function saveGuestIntent(intent: GuestIntent): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(intent));
  } catch {
    // Private mode / storage full — the visitor still lands in the wizard,
    // just without the prefill. Never block the journey on this.
  }
}

/** Reads AND clears. See the write-once note above. */
export function takeGuestIntent(): GuestIntent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as Partial<GuestIntent>;
    if (typeof parsed?.description !== 'string' || !parsed.description.trim()) return null;
    return {
      description: parsed.description,
      preset: typeof parsed.preset === 'string' ? parsed.preset : null,
    };
  } catch {
    return null;
  }
}
