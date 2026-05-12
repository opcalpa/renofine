import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";
import { 
  DollarSign, 
  TrendingUp, 
  Clock, 
  AlertTriangle,
  Loader2,
  CheckCircle,
  Package,
  X,
  Filter
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

interface BudgetDashboardProps {
  projectId: string;
  totalBudget: number | null;
  spentAmount: number | null;
  currency?: string | null;
}

const BudgetDashboard = ({ projectId, totalBudget, spentAmount, currency }: BudgetDashboardProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [approvedTotal, setApprovedTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [ongoingCostsTotal, setOngoingCostsTotal] = useState(0);
  const [ongoingCostsCount, setOngoingCostsCount] = useState(0);
  const [paymentsDialogOpen, setPaymentsDialogOpen] = useState(false);
  const [ongoingCostsDialogOpen, setOngoingCostsDialogOpen] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [ongoingCosts, setOngoingCosts] = useState<any[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<any[]>([]);
  const [filteredOngoingCosts, setFilteredOngoingCosts] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<string>("");
  const [ongoingFilterType, setOngoingFilterType] = useState<string>("all");
  const [ongoingFilterDate, setOngoingFilterDate] = useState<string>("");
  const [pieChartView, setPieChartView] = useState<string>("budget");
  const [costByRoom, setCostByRoom] = useState<any[]>([]);
  const [costByCostCenter, setCostByCostCenter] = useState<any[]>([]);
  const { toast } = useToast();

  const fetchPayments = async () => {
    try {
      // Get tasks with budget (considered as paid)
      const { data: tasksData, error: tasksError } = await supabase
        .from("tasks")
        .select(`
          id,
          title,
          budget,
          is_ata,
          parent_task_id,
          created_at,
          updated_at
        `)
        .eq("project_id", projectId)
        .not("budget", "is", null)
        .gt("budget", 0);

      if (tasksError) throw tasksError;

      // Get all purchase orders (exclude_from_budget = false)
      const { data: materialsData, error: materialsError } = await supabase
        .from("materials")
        .select(`
          id,
          name,
          price_total,
          status,
          exclude_from_budget,
          task_id,
          created_at,
          updated_at
        `)
        .eq("project_id", projectId)
        .eq("exclude_from_budget", false);

      if (materialsError) throw materialsError;

      // Build set of tasks that have linked purchase materials
      const taskIdsWithMaterials = new Set(
        (materialsData || []).filter(m => m.task_id).map(m => m.task_id)
      );

      // Only show tasks WITHOUT linked materials in the payments list
      // (tasks WITH linked materials are represented by their actual material entries)
      const taskPayments = (tasksData || [])
        .filter(task => !task.is_ata && !task.parent_task_id && !taskIdsWithMaterials.has(task.id))
        .map((task) => ({
          id: task.id,
          type: "task",
          name: task.title,
          amount: task.budget,
          date: task.updated_at,
          created_at: task.created_at,
        }));

      const materialPayments = (materialsData || []).map((material) => ({
        id: material.id,
        type: "purchase_order",
        name: material.name,
        amount: material.price_total,
        status: material.status,
        date: material.updated_at,
        created_at: material.created_at,
      }));

      const allPayments = [...taskPayments, ...materialPayments].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setPayments(allPayments);
      setFilteredPayments(allPayments);
    } catch (error: unknown) {
      console.error("Error fetching payments:", error);
      toast({
        title: t('common.error'),
        description: t('budgetDashboard.failedToLoadPayments'),
        variant: "destructive",
      });
    }
  };

  const fetchOngoingCosts = async () => {
    try {
      // Get purchase orders marked as exclude_from_budget
      const { data: materialsData, error: materialsError } = await supabase
        .from("materials")
        .select(`
          id,
          name,
          price_total,
          status,
          created_at,
          updated_at
        `)
        .eq("project_id", projectId)
        .eq("exclude_from_budget", true);

      if (materialsError) throw materialsError;

      // Format data
      const materialCosts = (materialsData || []).map((material) => ({
        id: material.id,
        type: "purchase_order",
        name: material.name,
        amount: material.price_total,
        status: material.status,
        date: material.updated_at,
        created_at: material.created_at,
      }));

      const allCosts = materialCosts.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setOngoingCosts(allCosts);
      setFilteredOngoingCosts(allCosts);
    } catch (error: unknown) {
      console.error("Error fetching ongoing costs:", error);
      toast({
        title: t('common.error'),
        description: t('budgetDashboard.failedToLoadOngoingCosts'),
        variant: "destructive",
      });
    }
  };

  // Filter payments when filters change
  useEffect(() => {
    let filtered = [...payments];

    // Filter by type
    if (filterType !== "all") {
      filtered = filtered.filter((p) => p.type === filterType);
    }

    // Filter by date
    if (filterDate) {
      const targetDate = new Date(filterDate);
      filtered = filtered.filter((p) => {
        const paymentDate = new Date(p.date);
        return (
          paymentDate.getFullYear() === targetDate.getFullYear() &&
          paymentDate.getMonth() === targetDate.getMonth() &&
          paymentDate.getDate() === targetDate.getDate()
        );
      });
    }

    setFilteredPayments(filtered);
  }, [payments, filterType, filterDate]);

  // Filter ongoing costs when filters change
  useEffect(() => {
    let filtered = [...ongoingCosts];

    // Filter by type (future-proof, currently only purchase_order)
    if (ongoingFilterType !== "all") {
      filtered = filtered.filter((c) => c.type === ongoingFilterType);
    }

    // Filter by date
    if (ongoingFilterDate) {
      const targetDate = new Date(ongoingFilterDate);
      filtered = filtered.filter((c) => {
        const costDate = new Date(c.date);
        return (
          costDate.getFullYear() === targetDate.getFullYear() &&
          costDate.getMonth() === targetDate.getMonth() &&
          costDate.getDate() === targetDate.getDate()
        );
      });
    }

    setFilteredOngoingCosts(filtered);
  }, [ongoingCosts, ongoingFilterType, ongoingFilterDate]);

  const handleOpenPayments = () => {
    fetchPayments();
    setPaymentsDialogOpen(true);
  };

  const handleOpenOngoingCosts = () => {
    fetchOngoingCosts();
    setOngoingCostsDialogOpen(true);
  };

  const fetchCostByRoom = async () => {
    try {
      const { data: materialsData } = await supabase
        .from("materials")
        .select(`
          price_total,
          exclude_from_budget,
          room_id,
          room:rooms(name)
        `)
        .eq("project_id", projectId)
        .eq("exclude_from_budget", false);

      const roomCosts: any = {};
      materialsData?.forEach((mat: any) => {
        const roomName = mat.room?.name || t('common.noRoom');
        roomCosts[roomName] = (roomCosts[roomName] || 0) + (mat.price_total || 0);
      });

      const data = Object.entries(roomCosts).map(([name, value]) => ({
        name,
        value,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
      }));

      setCostByRoom(data);
    } catch (error) {
      console.error("Error fetching cost by room:", error);
    }
  };

  const fetchCostByCostCenter = async () => {
    try {
      const { data: tasksData } = await supabase
        .from("tasks")
        .select("budget, cost_center")
        .eq("project_id", projectId);

      const centerCosts: any = {};
      tasksData?.forEach((task: any) => {
        const center = task.cost_center || t('budgetDashboard.noCostCenter');
        centerCosts[center] = (centerCosts[center] || 0) + (task.budget || 0);
      });

      const data = Object.entries(centerCosts).map(([name, value]) => ({
        name,
        value,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
      }));

      setCostByCostCenter(data);
    } catch (error) {
      console.error("Error fetching cost by cost center:", error);
    }
  };

  useEffect(() => {
    fetchPurchaseRequestData();
    fetchCostByRoom();
    fetchCostByCostCenter();

    // Set up real-time subscription
    const channel = supabase
      .channel('budget_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'materials'
        },
        () => {
          fetchPurchaseRequestData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const fetchPurchaseRequestData = async () => {
    try {
      // Get all materials (purchase orders) and tasks for this project
      const [{ data: materialsData, error: materialsError }, { data: ataTasksData }] = await Promise.all([
        supabase
          .from("materials")
          .select("price_total, status, exclude_from_budget")
          .eq("project_id", projectId),
        supabase
          .from("tasks")
          .select("budget, is_ata")
          .eq("project_id", projectId)
          .eq("is_ata", true),
      ]);

      if (materialsError) throw materialsError;

      // Calculate totals based on material status
      let pending = 0;
      let approved = 0;
      let pendingCnt = 0;
      let ongoing = 0;
      let ongoingCnt = 0;

      materialsData?.forEach((material: unknown) => {
        const mat = material as { price_total: number | null; status: string; exclude_from_budget: boolean };
        const cost = mat.price_total || 0;

        // Separate ÄTA costs (exclude_from_budget = true)
        if (mat.exclude_from_budget) {
          ongoing += cost;
          ongoingCnt++;
          return;
        }

        // Regular budget items: pending = avvaktande beslut, approved = bekräftade
        if (mat.status === "submitted" || mat.status === "to_order") {
          pending += cost;
          pendingCnt++;
        } else if (mat.status === "approved") {
          approved += cost;
        }
      });

      // Add ÄTA tasks to ongoing costs
      (ataTasksData || []).forEach((task: unknown) => {
        const t = task as { budget: number | null; is_ata: boolean };
        ongoing += t.budget || 0;
        ongoingCnt++;
      });

      setPendingTotal(pending);
      setApprovedTotal(approved);
      setPendingCount(pendingCnt);
      setOngoingCostsTotal(ongoing);
      setOngoingCostsCount(ongoingCnt);
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const budget = totalBudget || 0;
  const spent = spentAmount || 0;
  const committed = approvedTotal;
  const pending = pendingTotal;
  const remaining = budget - spent - committed - pending;

  const budgetPercentage = budget > 0 ? ((spent + committed) / budget) * 100 : 0;
  const pendingPercentage = budget > 0 ? (pending / budget) * 100 : 0;
  const remainingPercentage = budget > 0 ? (remaining / budget) * 100 : 0;

  // Pie chart data based on selected view
  const getPieData = () => {
    if (pieChartView === "room") {
      return costByRoom.filter(item => item.value > 0);
    } else if (pieChartView === "costCenter") {
      return costByCostCenter.filter(item => item.value > 0);
    }
    // Default: budget view
    return [
      { name: t('budgetDashboard.payments'), value: spent, color: '#ef4444' },
      { name: t('budgetDashboard.vendor'), value: committed, color: '#f97316' },
      { name: t('budgetDashboard.pending'), value: pending, color: '#eab308' },
      { name: t('budgetDashboard.remaining'), value: Math.max(0, remaining), color: '#22c55e' },
    ].filter(item => item.value > 0);
  };

  const pieData = getPieData();

  // Bar chart data (includes ongoing costs separately)
  const barData = [
    { category: t('budgetDashboard.totalBudget'), amount: budget },
    { category: t('budgetDashboard.payments'), amount: spent },
    { category: t('budgetDashboard.vendor'), amount: committed },
    { category: t('budgetDashboard.pending'), amount: pending },
    { category: t('budgetDashboard.extras'), amount: ongoingCostsTotal },
    { category: t('budgetDashboard.remaining'), amount: Math.max(0, remaining) },
  ];

  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e'];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('budgetDashboard.totalBudget')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(budget, currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('budgetDashboard.projectAllocation')}
            </p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={handleOpenPayments}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('budgetDashboard.payments')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(spent, currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('budgetDashboard.budgetUsed', { percentage: budgetPercentage.toFixed(1) })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('budgetDashboard.pendingOrders')}</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">
              {formatCurrency(pending, currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('budgetDashboard.ordersPending', { count: pendingCount })}
            </p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={handleOpenOngoingCosts}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('budgetDashboard.extras')}</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(ongoingCostsTotal, currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('budgetDashboard.excludedFromBudget', { count: ongoingCostsCount })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('budgetDashboard.remaining')}</CardTitle>
            {remaining < 0 ? (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            ) : (
              <CheckCircle className="h-4 w-4 text-success" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${remaining < 0 ? 'text-destructive' : 'text-success'}`}>
              {formatCurrency(remaining, currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {remaining < 0 ? t('budgetDashboard.overBudget') : t('budgetDashboard.availableToSpend')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Budget Alert */}
      {remaining < 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {t('budgetDashboard.budgetExceeded')}
            </CardTitle>
            <CardDescription>
              {t('budgetDashboard.budgetExceededDescription', { amount: formatCurrency(Math.abs(remaining), currency) })}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {pendingPercentage > 20 && remaining > 0 && (
        <Card className="border-warning bg-warning/5">
          <CardHeader>
            <CardTitle className="text-warning flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t('budgetDashboard.highPendingOrders')}
            </CardTitle>
            <CardDescription>
              {t('budgetDashboard.highPendingOrdersDescription', { amount: formatCurrency(pending, currency), percentage: pendingPercentage.toFixed(1) })}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>{t('budgetDashboard.budgetDistribution')}</CardTitle>
                <CardDescription>
                  {pieChartView === "budget" && t('budgetDashboard.budgetAllocationBreakdown')}
                  {pieChartView === "room" && t('budgetDashboard.costByRoom')}
                  {pieChartView === "costCenter" && t('budgetDashboard.costByCostCenter')}
                </CardDescription>
              </div>
              <Select value={pieChartView} onValueChange={setPieChartView}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="budget">{t('budgetDashboard.budgetOverview')}</SelectItem>
                  <SelectItem value="room">{t('budgetDashboard.perRoom')}</SelectItem>
                  <SelectItem value="costCenter">{t('budgetDashboard.perCostCenter')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value, currency)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{t('budgetDashboard.noBudgetData')}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{t('budgetDashboard.budgetComparison')}</CardTitle>
            <CardDescription>{t('budgetDashboard.compareBudgetCategories')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="category" 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={(value) => formatCurrency(value, currency, { compact: true })}
                  fontSize={12}
                />
                <Tooltip formatter={(value: number) => formatCurrency(value, currency)} />
                <Bar dataKey="amount" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Payments Detail Dialog */}
      <Dialog open={paymentsDialogOpen} onOpenChange={setPaymentsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('budgetDashboard.budgetExpenses')}</DialogTitle>
            <DialogDescription>
              {t('budgetDashboard.budgetExpensesDescription')}
            </DialogDescription>
          </DialogHeader>

          {/* Filters */}
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <Label htmlFor="filter-type" className="text-sm mb-2 block">
                <Filter className="h-4 w-4 inline mr-1" />
                {t('budgetDashboard.filterByType')}
              </Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger id="filter-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('budget.allTypes')}</SelectItem>
                  <SelectItem value="task">{t('budget.tasks')}</SelectItem>
                  <SelectItem value="purchase_order">{t('budgetDashboard.purchaseOrders')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1">
              <Label htmlFor="filter-date" className="text-sm mb-2 block">
                {t('budgetDashboard.filterByDate')}
              </Label>
              <div className="relative">
                <Input
                  id="filter-date"
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
                {filterDate && (
                  <button
                    onClick={() => setFilterDate("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-muted/50 p-4 rounded-lg mb-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">{t('budgetDashboard.totalPayments')}</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0), currency)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">{t('budgetDashboard.items')}</p>
                <p className="text-2xl font-bold">{filteredPayments.length}</p>
              </div>
            </div>
          </div>

          {/* Payments Table */}
          {filteredPayments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>{t('budgetDashboard.noPaymentsFound')}</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('budget.type')}</TableHead>
                    <TableHead>{t('budget.name')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="text-right">{t('budgetDashboard.amount')}</TableHead>
                    <TableHead>{t('budgetDashboard.date')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <TableRow key={`${payment.type}-${payment.id}`}>
                      <TableCell>
                        <Badge variant={payment.type === "task" ? "default" : "secondary"}>
                          {payment.type === "task" ? t('budget.task') : t('budgetDashboard.purchaseOrder')}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{payment.name}</TableCell>
                      <TableCell>
                        {payment.status ? (
                          <Badge variant="outline">{payment.status}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(payment.amount, currency)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(payment.date).toLocaleDateString('sv-SE')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Ongoing Costs Detail Dialog */}
      <Dialog open={ongoingCostsDialogOpen} onOpenChange={setOngoingCostsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('budgetDashboard.extrasTitle')}</DialogTitle>
            <DialogDescription>
              {t('budgetDashboard.extrasDescription')}
            </DialogDescription>
          </DialogHeader>

          {/* Filters */}
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <Label htmlFor="ongoing-filter-date" className="text-sm mb-2 block">
                {t('budgetDashboard.filterByDate')}
              </Label>
              <div className="relative">
                <Input
                  id="ongoing-filter-date"
                  type="date"
                  value={ongoingFilterDate}
                  onChange={(e) => setOngoingFilterDate(e.target.value)}
                />
                {ongoingFilterDate && (
                  <button
                    onClick={() => setOngoingFilterDate("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg mb-4 border border-blue-200 dark:border-blue-800">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">{t('budgetDashboard.totalExtras')}</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(filteredOngoingCosts.reduce((sum, c) => sum + (c.amount || 0), 0), currency)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">{t('budgetDashboard.items')}</p>
                <p className="text-2xl font-bold text-blue-600">{filteredOngoingCosts.length}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t('budgetDashboard.excludedFromBudgetNote')}
            </p>
          </div>

          {/* Costs Table */}
          {filteredOngoingCosts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>{t('budgetDashboard.noExtrasFound')}</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('budget.type')}</TableHead>
                    <TableHead>{t('budget.name')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="text-right">{t('budgetDashboard.amount')}</TableHead>
                    <TableHead>{t('budgetDashboard.date')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOngoingCosts.map((cost) => (
                    <TableRow key={`${cost.type}-${cost.id}`}>
                      <TableCell>
                        <Badge variant="secondary">
                          {t('budgetDashboard.purchaseOrder')}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{cost.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {cost.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-blue-600">
                        {formatCurrency(cost.amount, currency)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(cost.date).toLocaleDateString('sv-SE')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BudgetDashboard;