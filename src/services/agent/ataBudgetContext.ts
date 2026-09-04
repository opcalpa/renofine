/**
 * The IO half of budgetvakten, kept away from the decision.
 *
 * `suggestAta` must stay importable from a test with no env and no browser, so
 * anything that touches Supabase lives here.
 */
import { supabase } from '@/integrations/supabase/client';
import type { AtaBudgetContext } from './ataSuggestion';

/**
 * Fetch what the project agreed to, and what it has already committed.
 *
 * Both readings mirror what the budget surfaces already use, so the guard can
 * never disagree with the bar the person is looking at: `contract_value` is the
 * trigger-maintained sum of accepted quotes, and the committed total is the
 * materials that count INSIDE the budget (`exclude_from_budget = false`) — the
 * exact split BudgetDashboard renders.
 *
 * Never throws. A budget lookup that fails must not stop an import; the guard
 * simply stays quiet, which is its safe state anyway.
 */
export async function loadAtaBudgetContext(projectId: string): Promise<AtaBudgetContext> {
  const quiet: AtaBudgetContext = { contractValue: null, committedBefore: 0 };
  try {
    const [projectRes, materialsRes] = await Promise.all([
      supabase.from('projects').select('contract_value').eq('id', projectId).maybeSingle(),
      supabase
        .from('materials')
        .select('price_total')
        .eq('project_id', projectId)
        .eq('exclude_from_budget', false),
    ]);
    if (projectRes.error) {
      console.error('ataSuggestion: contract value lookup failed', projectRes.error);
      return quiet;
    }
    if (materialsRes.error) {
      console.error('ataSuggestion: committed lookup failed', materialsRes.error);
      return quiet;
    }
    const contractValue = (projectRes.data as { contract_value: number | null } | null)?.contract_value ?? null;
    const committedBefore = (materialsRes.data ?? []).reduce(
      (sum, m) => sum + ((m as { price_total: number | null }).price_total ?? 0),
      0,
    );
    return { contractValue, committedBefore };
  } catch (e) {
    console.error('ataSuggestion: budget context failed', e);
    return quiet;
  }
}
