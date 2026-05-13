// Contractor (proffs) budget view shell. Today this is a thin pass-through to
// BudgetTabCore (which already branches internally on userType). It exists
// as a seam: commit 9 will move InlineAddRow + InvoiceMethodDialog out of
// the shared core and into this shell, since they're contractor-only.

import { BudgetTabCore, type BudgetTabProps } from "./BudgetTabCore";

export function ContractorBudgetTab(props: BudgetTabProps) {
  return <BudgetTabCore {...props} />;
}
