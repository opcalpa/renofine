import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  ExternalLink, 
  Package,
  Loader2,
  Pencil
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";



interface Material {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  price_per_unit: number | null;
  price_total: number | null;
  vendor_name: string | null;
  vendor_link: string | null;
  status: string;
  exclude_from_budget: boolean;
  created_at: string;
  created_by_user_id: string;
  creator?: {
    name: string;
  };
}

interface MaterialsListProps {
  taskId: string;
  currency?: string | null;
}

const MaterialsList = ({ taskId, currency }: MaterialsListProps) => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  
  const [newMaterial, setNewMaterial] = useState({
    name: "",
    quantity: "",
    unit: "st",
    price_per_unit: "",
    vendor_name: "",
    vendor_link: "",
    exclude_from_budget: false,
  });

  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    fetchMaterials();

    // Set up real-time subscription for materials
    const channel = supabase
      .channel('materials_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'materials'
        },
        () => {
          fetchMaterials();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId]);

  const fetchMaterials = async () => {
    try {
      const { data: materialsData, error } = await supabase
        .from("materials")
        .select(`
          id,
          name,
          quantity,
          unit,
          price_per_unit,
          price_total,
          vendor_name,
          vendor_link,
          status,
          exclude_from_budget,
          created_at,
          created_by_user_id
        `)
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch creator names separately to avoid FK relationship issues
      const materialsWithCreators = await Promise.all((materialsData || []).map(async (material) => {
        let creatorName = null;
        if (material.created_by_user_id) {
          const { data: creator } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", material.created_by_user_id)
            .single();
          creatorName = creator?.name;
        }
        return {
          ...material,
          creator: creatorName ? { name: creatorName } : null,
        };
      }));

      setMaterials(materialsWithCreators);
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      // Get project_id from task
      const { data: taskData } = await supabase
        .from("tasks")
        .select("project_id")
        .eq("id", taskId)
        .single();

      if (!taskData) throw new Error("Task not found");

      const { error } = await supabase.from("materials").insert({
        project_id: taskData.project_id,
        task_id: taskId,
        name: newMaterial.name,
        quantity: newMaterial.quantity ? parseFloat(newMaterial.quantity) : null,
        unit: newMaterial.unit,
        price_per_unit: newMaterial.price_per_unit ? parseFloat(newMaterial.price_per_unit) : null,
        vendor_name: newMaterial.vendor_name,
        vendor_link: newMaterial.vendor_link,
        exclude_from_budget: newMaterial.exclude_from_budget,
        created_by_user_id: profile.id,
        status: "new",
      });

      if (error) throw error;

      toast({
        title: t('common.success', 'Success'),
        description: t('purchases.orderAdded', 'Purchase order added successfully'),
      });

      setDialogOpen(false);
      setNewMaterial({
        name: "",
        quantity: "",
        unit: "st",
        price_per_unit: "",
        vendor_name: "",
        vendor_link: "",
        exclude_from_budget: false,
      });
      fetchMaterials();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error.message || t('purchases.failedToAdd', 'Failed to add purchase order'),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleEditMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;

    setCreating(true);
    try {
      const { error } = await supabase
        .from("materials")
        .update({
          name: editingMaterial.name,
          quantity: editingMaterial.quantity,
          unit: editingMaterial.unit,
          price_per_unit: editingMaterial.price_per_unit,
          vendor_name: editingMaterial.vendor_name,
          vendor_link: editingMaterial.vendor_link,
          exclude_from_budget: editingMaterial.exclude_from_budget,
        })
        .eq("id", editingMaterial.id);

      if (error) throw error;

      toast({
        title: t('common.success', 'Success'),
        description: t('purchases.orderUpdated', 'Purchase order updated successfully'),
      });

      setEditDialogOpen(false);
      setEditingMaterial(null);
      fetchMaterials();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error.message || t('purchases.failedToUpdate', 'Failed to update purchase order'),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (materialId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("materials")
        .update({ status: newStatus })
        .eq("id", materialId);

      if (error) throw error;

      toast({
        title: t('purchases.statusUpdated', 'Status Updated'),
        description: t('purchases.statusChangedTo', 'Purchase order status changed to {{status}}.', { status: newStatus }),
      });

      fetchMaterials();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="py-4 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Package className="h-4 w-4" />
          {t('purchases.title')} ({materials.length})
        </h4>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-3 w-3 mr-1" />
              {t('purchases.addOrder')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('purchases.addOrder')}</DialogTitle>
              <DialogDescription>
                {t('purchases.addOrderDescription')}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddMaterial} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="material-name">{t('purchases.materialName')}*</Label>
                <Input
                  id="material-name"
                  placeholder="e.g., Paint, Wood, Tiles"
                  value={newMaterial.name}
                  onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">{t('common.quantity')}*</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.01"
                    placeholder="10"
                    value={newMaterial.quantity}
                    onChange={(e) => setNewMaterial({ ...newMaterial, quantity: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">{t('common.unit')}*</Label>
                  <Input
                    id="unit"
                    placeholder="e.g., gallons, sqft"
                    value={newMaterial.unit}
                    onChange={(e) => setNewMaterial({ ...newMaterial, unit: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="price_per_unit">{t('purchases.pricePerUnit')} ({t('common.optional')})</Label>
                <Input
                  id="price_per_unit"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newMaterial.price_per_unit}
                  onChange={(e) => setNewMaterial({ ...newMaterial, price_per_unit: e.target.value })}
                />
                {newMaterial.quantity && newMaterial.price_per_unit && (
                  <p className="text-sm text-muted-foreground">
                    Price Total: {formatCurrency(parseFloat(newMaterial.quantity) * parseFloat(newMaterial.price_per_unit), currency, { decimals: 2 })}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor-name">{t('purchases.vendorName')} ({t('common.optional')})</Label>
                <Input
                  id="vendor-name"
                  placeholder="Home Depot, Lowe's, etc."
                  value={newMaterial.vendor_name}
                  onChange={(e) => setNewMaterial({ ...newMaterial, vendor_name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor-link">{t('purchases.vendorLink')} ({t('common.optional')})</Label>
                <Input
                  id="vendor-link"
                  type="url"
                  placeholder="https://..."
                  value={newMaterial.vendor_link}
                  onChange={(e) => setNewMaterial({ ...newMaterial, vendor_link: e.target.value })}
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="exclude-from-budget"
                  checked={newMaterial.exclude_from_budget}
                  onChange={(e) => setNewMaterial({ ...newMaterial, exclude_from_budget: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="exclude-from-budget" className="text-sm font-normal cursor-pointer">
                  {t('purchases.excludeFromBudget')}
                </Label>
              </div>

              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {t('purchases.creating')}
                  </>
                ) : (
                  t('purchases.createOrder')
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Material Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('purchases.editOrder')}</DialogTitle>
            <DialogDescription>
              {t('purchases.editOrderDescription')}
            </DialogDescription>
          </DialogHeader>
          {editingMaterial && (
            <form onSubmit={handleEditMaterial} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-material-name">{t('purchases.materialName')}*</Label>
                <Input
                  id="edit-material-name"
                  value={editingMaterial.name}
                  onChange={(e) => setEditingMaterial({ ...editingMaterial, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-quantity">{t('common.quantity')}*</Label>
                  <Input
                    id="edit-quantity"
                    type="number"
                    step="0.01"
                    value={editingMaterial.quantity}
                    onChange={(e) => setEditingMaterial({ ...editingMaterial, quantity: parseFloat(e.target.value) })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-unit">{t('common.unit')}*</Label>
                  <Input
                    id="edit-unit"
                    value={editingMaterial.unit}
                    onChange={(e) => setEditingMaterial({ ...editingMaterial, unit: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-price-per-unit">Price per Unit</Label>
                <Input
                  id="edit-price-per-unit"
                  type="number"
                  step="0.01"
                  value={editingMaterial.price_per_unit || ""}
                  onChange={(e) => setEditingMaterial({ ...editingMaterial, price_per_unit: e.target.value ? parseFloat(e.target.value) : null })}
                />
                {editingMaterial.quantity && editingMaterial.price_per_unit && (
                  <p className="text-sm text-muted-foreground">
                    Price Total: {formatCurrency(editingMaterial.quantity * editingMaterial.price_per_unit, currency, { decimals: 2 })}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-vendor-name">Vendor Name</Label>
                <Input
                  id="edit-vendor-name"
                  value={editingMaterial.vendor_name || ""}
                  onChange={(e) => setEditingMaterial({ ...editingMaterial, vendor_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-vendor-link">Vendor Link</Label>
                <Input
                  id="edit-vendor-link"
                  type="url"
                  value={editingMaterial.vendor_link || ""}
                  onChange={(e) => setEditingMaterial({ ...editingMaterial, vendor_link: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit-exclude-from-budget"
                  checked={editingMaterial.exclude_from_budget}
                  onChange={(e) => setEditingMaterial({ ...editingMaterial, exclude_from_budget: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="edit-exclude-from-budget" className="text-sm font-normal cursor-pointer">
                  {t('purchases.excludeFromBudget')}
                </Label>
              </div>
              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? t('purchases.updating') : t('purchases.updateOrder')}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {materials.length === 0 ? (
        <div className="text-center py-6 border border-dashed rounded-lg">
          <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">{t('purchases.noPurchaseOrders')}</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b">
                <th className="px-3 py-2.5 kicker text-left">{t('purchases.materialName')}</th>
                <th className="px-3 py-2.5 kicker text-left">{t('common.quantity')}</th>
                <th className="px-3 py-2.5 kicker text-right">{t('purchases.pricePerUnit')}</th>
                <th className="px-3 py-2.5 kicker text-right">{t('purchases.priceTotal')}</th>
                <th className="px-3 py-2.5 kicker text-left">{t('purchases.vendor')}</th>
                <th className="px-3 py-2.5 kicker text-left">{t('purchases.addedBy')}</th>
                <th className="px-3 py-2.5 kicker text-left">{t('purchases.addedDate')}</th>
                <th className="px-3 py-2.5 kicker text-left">{t('common.status')}</th>
                <th className="px-3 py-2.5 kicker w-[50px]" />
              </tr>
            </thead>
            <tbody>
              {materials.map((material) => (
                <tr key={material.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5 font-medium">{material.name}</td>
                  <td className="px-3 py-2.5">
                    {material.quantity} {material.unit}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {material.price_per_unit ? formatCurrency(material.price_per_unit, currency, { decimals: 2 }) : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    {material.price_total ? formatCurrency(material.price_total, currency, { decimals: 2 }) : "-"}
                  </td>
                  <td className="px-3 py-2.5">
                    {material.vendor_name ? (
                      material.vendor_link ? (
                        <a
                          href={material.vendor_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          {material.vendor_name}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        material.vendor_name
                      )
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {material.creator?.name || "Unknown"}
                  </td>
                  <td className="px-3 py-2.5">
                    {new Date(material.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <Select
                      value={material.status}
                      onValueChange={(value) => handleStatusChange(material.id, value)}
                    >
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">{t('materialStatuses.new')}</SelectItem>
                        <SelectItem value="ordered">{t('materialStatuses.ordered')}</SelectItem>
                        <SelectItem value="delivered">{t('materialStatuses.delivered')}</SelectItem>
                        <SelectItem value="paid">{t('materialStatuses.paid')}</SelectItem>
                        <SelectItem value="installed">{t('materialStatuses.installed')}</SelectItem>
                        <SelectItem value="done">{t('materialStatuses.done')}</SelectItem>
                        <SelectItem value="declined">{t('materialStatuses.declined')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingMaterial(material);
                        setEditDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MaterialsList;