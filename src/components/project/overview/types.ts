import type { ActivityLogItem } from "../feed/types";

export interface OverviewTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  progress: number;
  assigned_to_contractor_id: string | null;
  assignee_name: string | null;
}

export interface TaskStats {
  total: number;
  completed: number;
  inProgress: number;
  overdue: OverviewTask[];
  blockedOrOnHold: OverviewTask[];
  percentage: number;
}

export interface BudgetStats {
  total: number | null;
  spent: number;
  percentage: number;
  isWarning: boolean;
  contractTotal: number;
  invoicedTotal: number;
  invoicedPercent: number;
  estimatedProfit: number;
}

export interface OrderStats {
  pendingCount: number;
}

export interface InvoiceStats {
  contractTotal: number;
  invoicedTotal: number;
  receivedTotal: number;
  unbilledTotal: number;
  overdueTotal: number;
  ataTotal: number;
}

export interface TimelineStats {
  finishGoalDate: string | null;
  startDate: string | null;
  daysRemaining: number | null;
}

export interface OverviewNavigation {
  onNavigateToTasks: (taskId?: string) => void;
  onNavigateToPurchases: () => void;
  onNavigateToFeed: () => void;
  onNavigateToBudget: () => void;
  onOpenSettings: () => void;
}

export interface OverviewProject {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  total_budget: number | null;
  contract_value: number | null;
  spent_amount: number | null;
  start_date: string | null;
  finish_goal_date: string | null;
  currency?: string | null;
  address?: string | null;
  property_designation?: string | null;
  source_rfq_project_id?: string | null;
  cover_image_url?: string | null;
  cover_image_position?: number | null;
  cover_image_zoom?: number | null;
}

export interface OverviewData {
  taskStats: TaskStats;
  budgetStats: BudgetStats;
  orderStats: OrderStats;
  timelineStats: TimelineStats;
  inProgressTasks: OverviewTask[];
  recentActivities: ActivityLogItem[];
  loading: boolean;
  refetch: () => void;
}
