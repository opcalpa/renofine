// Role-router for the budget tab. Picks Owner (homeowner) or Contractor
// (proffs) shell based on userType. Both shells currently delegate to
// BudgetTabCore, which contains the shared table + dialogs. Future
// divergence per the role-separation architecture memo happens at the
// shell level.

import { OwnerBudgetTab } from "./budget/OwnerBudgetTab";
import { ContractorBudgetTab } from "./budget/ContractorBudgetTab";
import type { BudgetTabProps } from "./budget/BudgetTabCore";

const BudgetTab = (props: BudgetTabProps) => {
  const isHomeowner = props.userType === "homeowner";
  return isHomeowner ? <OwnerBudgetTab {...props} /> : <ContractorBudgetTab {...props} />;
};

export default BudgetTab;
