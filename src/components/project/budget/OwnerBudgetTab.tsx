// Homeowner budget view shell. Today this is a thin pass-through to
// BudgetTabCore (which already branches internally on userType). It exists
// as a seam: future work can replace the body here with an OwnerBudget-
// specific composition (cashflow + ROT 3-lager per the role-separation
// architecture memo) without touching the contractor path.

import { BudgetTabCore, type BudgetTabProps } from "./BudgetTabCore";

export function OwnerBudgetTab(props: BudgetTabProps) {
  return <BudgetTabCore {...props} userType="homeowner" />;
}
