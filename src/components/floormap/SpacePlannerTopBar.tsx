import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, Plus, Layers, Trash2, Pencil, MoreVertical, Home, User, LogOut, Globe, LayoutDashboard, CheckSquare, ShoppingCart, Users, Map, PanelTop, Box, Eye, Grid3X3 } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFloorMapStore } from "./store";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { createPlanInDB, deletePlanFromDB, updatePlanInDB } from "./utils/plans";
import { isEditorV2Enabled } from "./editor/flag";
import { ViewSettingsPopover } from "./editor/ViewSettingsPopover";

interface SpacePlannerTopBarProps {
  projectId: string;
  projectName?: string;
  onBack?: () => void;
  backLabel?: string;
  isReadOnly?: boolean;
}

export const SpacePlannerTopBar = ({ projectId, projectName, onBack, backLabel, isReadOnly }: SpacePlannerTopBarProps) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language || 'sv');

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    setCurrentLanguage(lang);
  };
  const {
    viewMode,
    setViewMode,
    plans,
    currentPlanId,
    setCurrentPlanId,
    addPlan,
    updatePlan,
    deletePlan,
    shapes,
    toggleGrid,
  } = useFloorMapStore();
  const gridVisible = useFloorMapStore(s => s.projectSettings.gridVisible);
  const editorV2 = isEditorV2Enabled();
  const [showNewPlanDialog, setShowNewPlanDialog] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanDescription, setNewPlanDescription] = useState("");
  const [planToDelete, setPlanToDelete] = useState<string | null>(null);
  const [planToRename, setPlanToRename] = useState<string | null>(null);
  const [renamePlanName, setRenamePlanName] = useState("");

  // No auto-hide - always visible for better UX
  // This matches industry standard design tools (Figma, Canva, etc.)

  const handleCreateNewPlan = async () => {
    if (!newPlanName.trim()) {
      toast({
        title: t('floormap.nameRequired', 'Name required'),
        description: t('floormap.enterPlanName', 'Enter a name for the new plan'),
        variant: "destructive",
      });
      return;
    }

    try {
      // Create plan in database
      const newPlan = await createPlanInDB(projectId, newPlanName.trim());
      
      if (!newPlan) {
        throw new Error(t('floormap.couldNotCreatePlan', 'Could not create plan'));
      }

      // Add to store
      addPlan(newPlan);
      setCurrentPlanId(newPlan.id);
      setShowNewPlanDialog(false);
      setNewPlanName("");
      setNewPlanDescription("");

      toast({
        title: t('floormap.newPlanCreated', 'New plan created!'),
        description: t('floormap.planCreatedDescription', { name: newPlan.name, defaultValue: `"${newPlan.name}" has been created and is now active` }),
      });
    } catch (error: unknown) {
      console.error('Error creating plan:', error);
      toast({
        title: t('floormap.errorCreating', 'Error creating plan'),
        description: error.message || t('floormap.couldNotCreatePlan', 'Could not create plan'),
        variant: "destructive",
      });
    }
  };

  const handleDeletePlan = async (planId: string) => {
    // Prevent deleting if it's the last plan
    if (plans.length <= 1) {
      toast({
        title: t('floormap.cannotDelete', 'Cannot delete'),
        description: t('floormap.mustHaveOnePlan', 'You must have at least one plan. Create a new one before deleting this.'),
        variant: "destructive",
      });
      return;
    }

    try {
      // Delete from database
      const success = await deletePlanFromDB(planId);
      
      if (!success) {
        throw new Error(t('floormap.couldNotDeletePlan', 'Could not delete plan from database'));
      }

      // If we're deleting the current plan, switch to another one
      if (currentPlanId === planId) {
        const otherPlan = plans.find(p => p.id !== planId);
        if (otherPlan) {
          setCurrentPlanId(otherPlan.id);
        }
      }

      // Remove from store
      deletePlan(planId);
      setPlanToDelete(null);

      const deletedPlan = plans.find(p => p.id === planId);
      toast({
        title: t('floormap.planDeleted', 'Plan deleted'),
        description: t('floormap.planDeletedDescription', { name: deletedPlan?.name, defaultValue: `"${deletedPlan?.name}" has been deleted` }),
      });
    } catch (error: unknown) {
      console.error('Error deleting plan:', error);
      toast({
        title: t('floormap.errorDeleting', 'Error deleting plan'),
        description: error.message || t('floormap.couldNotDeletePlan', 'Could not delete plan from database'),
        variant: "destructive",
      });
    }
  };

  const handleRenamePlan = async () => {
    if (!planToRename || !renamePlanName.trim()) return;

    const trimmedName = renamePlanName.trim();
    const plan = plans.find(p => p.id === planToRename);
    if (!plan || plan.name === trimmedName) {
      setPlanToRename(null);
      return;
    }

    try {
      const success = await updatePlanInDB(planToRename, { name: trimmedName });
      if (!success) throw new Error(t('floormap.couldNotRenamePlan', 'Could not rename plan'));

      updatePlan(planToRename, { name: trimmedName });
      setPlanToRename(null);
      setRenamePlanName("");

      toast({
        title: t('floormap.planRenamed', 'Plan renamed'),
        description: t('floormap.planRenamedDescription', { name: trimmedName, defaultValue: `Plan renamed to "${trimmedName}"` }),
      });
    } catch (error: unknown) {
      console.error('Error renaming plan:', error);
      toast({
        title: t('floormap.errorRenaming', 'Error renaming plan'),
        description: error instanceof Error ? error.message : t('floormap.couldNotRenamePlan', 'Could not rename plan'),
        variant: "destructive",
      });
    }
  };

  const currentPlan = plans.find(p => p.id === currentPlanId);
  const currentPlanShapes = shapes.filter(s => s.planId === currentPlanId);

  return (
    <header className="h-14 border-b border-border bg-card/95 backdrop-blur-md fixed top-0 left-0 right-0 z-[60] flex items-center px-2 md:px-4 gap-2 md:gap-4 shadow-sm">
      {/* Main Menu (3 dots) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {/* Project Navigation */}
          <DropdownMenuLabel>{projectName || t('Project')}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => navigate(`/projects/${projectId}`)} className="cursor-pointer">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>{t('projectDetail.overview')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/projects/${projectId}?tab=tasks`)} className="cursor-pointer">
            <CheckSquare className="mr-2 h-4 w-4" />
            <span>{t('projectDetail.tasks')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/projects/${projectId}?tab=purchases`)} className="cursor-pointer">
            <ShoppingCart className="mr-2 h-4 w-4" />
            <span>{t('purchases.title')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/projects/${projectId}?tab=team`)} className="cursor-pointer">
            <Users className="mr-2 h-4 w-4" />
            <span>{t('roles.title')}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />

          {/* App Navigation */}
          <DropdownMenuLabel>Renofine</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => navigate("/start")} className="cursor-pointer">
            <Home className="mr-2 h-4 w-4" />
            <span>{t('nav.start')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer">
            <User className="mr-2 h-4 w-4" />
            <span>{t('nav.profile')}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Globe className="mr-2 h-4 w-4" />
              <span>{t('common.language')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={currentLanguage} onValueChange={handleLanguageChange}>
                <DropdownMenuRadioItem value="sv">Svenska</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            <span>{t('common.signOut')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Back button - contextual based on view mode */}
      {viewMode === 'elevation' ? (
        // In elevation view: back goes to floor plan
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setViewMode('floor')}
          className="gap-2 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("common.back", "Tillbaka")}</span>
        </Button>
      ) : onBack ? (
        // In floor plan with onBack callback: use it to go to previous page
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-2 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("common.back", "Tillbaka")}</span>
        </Button>
      ) : (
        // Fallback: link to project overview
        <Link
          to={`/projects/${projectId}`}
          className="inline-flex items-center justify-center gap-2 shrink-0 h-9 px-3 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("common.back", "Tillbaka")}</span>
        </Link>
      )}
      
      <div className="h-6 w-px bg-border hidden sm:block" />

      <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground min-w-0">
        <span
          className="truncate max-w-[120px] sm:max-w-[200px] text-foreground font-medium"
          title={projectName}
        >
          {projectName || t("Project")}
        </span>
        {isReadOnly && (
          <Badge variant="secondary" className="text-xs shrink-0">
            <Eye className="h-3 w-3 mr-1" />
            {t('common.viewOnly', 'View only')}
          </Badge>
        )}
      </div>

      {/* Plan Selector */}
      <div className="ml-1 md:ml-4 flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 md:gap-2">
              <Layers className="h-4 w-4" />
              <span className="hidden md:inline max-w-[200px] truncate">
                {currentPlan?.name || t('floormap.selectPlan', 'Select plan')}
              </span>
              {currentPlanShapes.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {currentPlanShapes.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[300px]">
            <DropdownMenuLabel>{t('floormap.floorPlans', 'Floor Plans')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            {plans.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                {t('floormap.noPlansCreated', 'No plans created yet')}
              </div>
            ) : (
              plans.map((plan) => {
                const planShapes = shapes.filter(s => s.planId === plan.id);
                return (
                  <DropdownMenuItem
                    key={plan.id}
                    className={`${currentPlanId === plan.id ? "bg-accent" : ""} group`}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <div 
                      className="flex flex-col flex-1 gap-1 cursor-pointer"
                      onClick={() => setCurrentPlanId(plan.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{plan.name}</span>
                        {planShapes.length > 0 && (
                          <Badge variant="secondary" className="ml-2">
                            {planShapes.length} {t('floormap.objects', 'objects')}
                          </Badge>
                        )}
                      </div>
                      {plan.description && (
                        <span className="text-xs text-muted-foreground">
                          {plan.description}
                        </span>
                      )}
                    </div>
                    {!isReadOnly && (
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPlanToRename(plan.id);
                            setRenamePlanName(plan.name);
                          }}
                        >
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPlanToDelete(plan.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </DropdownMenuItem>
                );
              })
            )}
            
            {!isReadOnly && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowNewPlanDialog(true)}
                  className="text-primary"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('floormap.createNewPlan', 'Create new plan')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Separator */}
        <div className="h-5 w-px bg-border mx-2" />

        {/* Room Description Link */}
        <button
          type="button"
          onClick={() => {
            window.location.href = `/projects/${projectId}?tab=spaceplanner&subtab=rooms`;
          }}
          className="text-sm font-medium text-primary hover:text-primary/80 hover:underline transition-colors whitespace-nowrap cursor-pointer"
        >
          {t('floormap.roomDescription', 'Rumsbeskrivning')}
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* View settings (v2: full popover — display-only, safe in read-only; v1: plain grid toggle) */}
        {editorV2 && viewMode === 'floor' && <ViewSettingsPopover />}
        {!editorV2 && !isReadOnly && viewMode === 'floor' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleGrid}
              className={cn(
                "h-8 px-2 gap-1.5 text-xs",
                gridVisible ? "text-blue-600 bg-blue-50 hover:bg-blue-100" : "text-muted-foreground"
              )}
              title={gridVisible ? "Dölj rutnät" : "Visa rutnät"}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
        )}

        <div className="flex items-center bg-muted/50 rounded-lg p-1">
          <Button
            variant={viewMode === "floor" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("floor")}
            className="h-8 px-2 md:px-3 text-xs"
          >
            <Map className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">{editorV2 ? t("floormap.view2d", "2D") : t("Floor Plan")}</span>
          </Button>
          {/* v2: elevation is reached from a selected wall (contextual), never a global tab */}
          {!editorV2 && (
            <Button
              variant={viewMode === "elevation" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("elevation")}
              className="h-8 px-2 md:px-3 text-xs"
            >
              <PanelTop className="h-4 w-4 md:mr-1" />
              <span className="hidden md:inline">{t("floormap.elevationView")}</span>
            </Button>
          )}
          <Button
            variant={viewMode === "3d" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("3d")}
            className="h-8 px-2 md:px-3 text-xs"
          >
            <Box className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">{editorV2 ? "3D" : t("3D View")}</span>
          </Button>
        </div>
      </div>

      {/* New Plan Dialog */}
      <Dialog open={showNewPlanDialog} onOpenChange={setShowNewPlanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('floormap.createNewPlan', 'Create new plan')}</DialogTitle>
            <DialogDescription>
              {t('floormap.createNewPlanDescription', 'Create a new empty plan or import from a drawing')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="plan-name">{t('floormap.planName', 'Plan name')} *</Label>
              <Input
                id="plan-name"
                placeholder={t('floormap.planNamePlaceholder', 'e.g. Floor 1, Basement, Alternative A')}
                value={newPlanName}
                onChange={(e) => setNewPlanName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateNewPlan();
                  }
                }}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="plan-description">{t('common.description', 'Description')} ({t('common.optional', 'optional')})</Label>
              <Input
                id="plan-description"
                placeholder={t('floormap.planDescriptionPlaceholder', 'e.g. Main plan with all rooms')}
                value={newPlanDescription}
                onChange={(e) => setNewPlanDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewPlanDialog(false);
                setNewPlanName("");
                setNewPlanDescription("");
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateNewPlan}>
              <Plus className="h-4 w-4 mr-2" />
              {t('floormap.createNewPlan', 'Create new plan')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Plan Dialog */}
      <Dialog open={!!planToRename} onOpenChange={(open) => { if (!open) { setPlanToRename(null); setRenamePlanName(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('floormap.renamePlan', 'Rename plan')}</DialogTitle>
            <DialogDescription>
              {t('floormap.renamePlanDescription', 'Enter a new name for the plan')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-plan">{t('floormap.planName', 'Plan name')} *</Label>
              <Input
                id="rename-plan"
                value={renamePlanName}
                onChange={(e) => setRenamePlanName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenamePlan();
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPlanToRename(null); setRenamePlanName(""); }}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleRenamePlan} disabled={!renamePlanName.trim()}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Plan Confirmation Dialog */}
      <AlertDialog open={!!planToDelete} onOpenChange={(open) => !open && setPlanToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('floormap.deleteFloorPlan', 'Delete Floor Plan?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('floormap.deleteConfirmation', { name: plans.find(p => p.id === planToDelete)?.name, defaultValue: `Are you sure you want to delete "${plans.find(p => p.id === planToDelete)?.name}"?` })}
              <br />
              <br />
              <strong>{t('floormap.cannotBeUndone', 'This cannot be undone.')}</strong> {t('floormap.allObjectsDeleted', 'All walls, rooms, and objects in this plan will be permanently deleted.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => planToDelete && handleDeletePlan(planToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('floormap.deletePlan', 'Delete plan')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
};
