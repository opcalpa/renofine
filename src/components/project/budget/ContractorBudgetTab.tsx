// Contractor (proffs) budget view shell. Wraps BudgetTabCore with the
// contractor-only InvoiceMethodDialog so that:
//   1. The dialog never mounts for homeowners (BudgetTabCore stays role-agnostic)
//   2. "Skapa faktura" from BuilderSummaryCards routes through onCreateInvoice
//      prop, opening the dialog at the shell level
//
// Per the role-separation memo, dialogs specific to one role belong in the
// shell, not the shared core.

import { useState } from "react";
import { InvoiceMethodDialog } from "@/components/invoices/InvoiceMethodDialog";
import { BudgetTabCore, type BudgetTabProps } from "./BudgetTabCore";

export function ContractorBudgetTab(props: BudgetTabProps) {
  const [invoiceMethodOpen, setInvoiceMethodOpen] = useState(false);

  return (
    <>
      <BudgetTabCore {...props} onCreateInvoice={() => setInvoiceMethodOpen(true)} />
      <InvoiceMethodDialog
        projectId={props.projectId}
        open={invoiceMethodOpen}
        onOpenChange={setInvoiceMethodOpen}
      />
    </>
  );
}
