import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTaxDeductionVisible } from "@/hooks/useTaxDeduction";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import {
  UserPlus,
  X,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronRight,
  Wrench,
  ClipboardList,
  User,
  Eye,
  Users,
} from "lucide-react";
import { z } from "zod";

import { FeatureAccessEditor } from "./team/FeatureAccessEditor";
import type { FeatureAccess } from "./team/FeatureAccessEditor";
import { TeamTable } from "./team/TeamTable";
import type { TeamRow } from "./team/TeamTable";
import { AccessConsequenceList } from "./team/AccessConsequenceList";
import { PROFESSION_KEYS } from "./team/professions";
import { InviteWizard } from "./team/invite-wizard";
import type { InvitePath, WorkerPrefill } from "./team/invite-wizard";
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
import { DirectMessageSheet } from "./DirectMessageSheet";


import { useUnreadDmCounts } from "@/hooks/useDirectMessages";


interface TeamMember {
  id: string;
  profile_id: string;
  user_name: string;
  user_email: string;
  role: string;
  role_type: "contractor" | "client" | "co_owner" | "other" | null;
  contractor_category: string | null;
  contractor_role: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  created_at: string | null;
  customer_view_access?: string;
  timeline_access?: string;
  tasks_access?: string;
  tasks_scope?: string;
  space_planner_access?: string;
  purchases_access?: string;
  purchases_scope?: string;
  overview_access?: string;
  teams_access?: string;
  budget_access?: string;
  files_access?: string;
}

interface Invitation {
  id: string;
  email: string;
  phone?: string;
  delivery_method: string;
  role: string;
  status: string;
  created_at: string;
  token: string;
  contractor_role?: string;
  customer_view_access?: string;
  timeline_access?: string;
  tasks_access?: string;
  tasks_scope?: string;
  space_planner_access?: string;
  purchases_access?: string;
  purchases_scope?: string;
  overview_access?: string;
  teams_access?: string;
  budget_access?: string;
  files_access?: string;
}

interface ProjectOwner {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
}

interface TeamManagementProps {
  projectId: string;
  isOwner: boolean;
  canManageTeam?: boolean;
}

const ROLE_TEMPLATES: Record<string, { access: FeatureAccess }> = {
  contractor: {
    access: {
      customerView: "none",
      timeline: "view",
      tasks: "edit",
      tasksScope: "assigned",
      spacePlanner: "view",
      purchases: "create",
      purchasesScope: "assigned",
      overview: "view",
      teams: "none",
      budget: "none",
      files: "view",
    },
  },
  project_manager: {
    access: {
      customerView: "none",
      timeline: "edit",
      tasks: "edit",
      tasksScope: "all",
      spacePlanner: "edit",
      purchases: "edit",
      purchasesScope: "all",
      overview: "edit",
      teams: "invite",
      budget: "edit",
      files: "edit",
    },
  },
  client: {
    access: {
      customerView: "view",
      timeline: "view",
      tasks: "view",
      tasksScope: "all",
      spacePlanner: "view",
      purchases: "view",
      purchasesScope: "all",
      overview: "view",
      teams: "none",
      budget: "view",
      files: "view",
    },
  },
  collaborator: {
    access: {
      customerView: "none",
      timeline: "view",
      tasks: "view",
      tasksScope: "all",
      spacePlanner: "view",
      purchases: "view",
      purchasesScope: "all",
      overview: "view",
      teams: "none",
      budget: "none",
      files: "upload",
    },
  },
  worker: {
    access: {
      customerView: "none",
      timeline: "none",
      tasks: "none",
      tasksScope: "assigned",
      spacePlanner: "none",
      purchases: "none",
      purchasesScope: "assigned",
      overview: "none",
      teams: "none",
      budget: "none",
      files: "none",
    },
  },
};

// Legacy mapping — existing DB shares with old keys still resolve correctly
const LEGACY_ROLE_MAP: Record<string, string> = {
  architect: "collaborator",
  viewer: "collaborator",
  co_owner: "project_manager",
};

const ROLE_ICONS: Record<string, typeof Wrench> = {
  contractor: Wrench,
  project_manager: ClipboardList,
  collaborator: Eye,
  client: User,
  worker: Wrench,
};

const invitationSchemaEmail = z.object({
  email: z
    .string()
    .trim()
    .email({ message: "Invalid email address" })
    .max(255),
});

function accessToDb(access: FeatureAccess) {
  return {
    customer_view_access: access.customerView,
    timeline_access: access.timeline,
    tasks_access: access.tasks,
    tasks_scope: access.tasksScope,
    space_planner_access: access.spacePlanner,
    purchases_access: access.purchases,
    purchases_scope: access.purchasesScope,
    overview_access: access.overview,
    teams_access: access.teams,
    budget_access: access.budget,
    files_access: access.files,
  };
}

function dbToAccess(
  source: Partial<Record<string, string | null | undefined>>,
  fallback: "none" | "view" = "none"
): FeatureAccess {
  return {
    customerView: (source.customer_view_access as FeatureAccess["customerView"]) || "none",
    timeline: (source.timeline_access as FeatureAccess["timeline"]) || fallback,
    tasks: (source.tasks_access as FeatureAccess["tasks"]) || fallback,
    tasksScope: (source.tasks_scope as FeatureAccess["tasksScope"]) || "assigned",
    spacePlanner: (source.space_planner_access as FeatureAccess["spacePlanner"]) || fallback,
    purchases: (source.purchases_access as FeatureAccess["purchases"]) || fallback,
    purchasesScope: (source.purchases_scope as FeatureAccess["purchasesScope"]) || "assigned",
    overview: (source.overview_access as FeatureAccess["overview"]) || fallback,
    teams: (source.teams_access as FeatureAccess["teams"]) || "none",
    budget: (source.budget_access as FeatureAccess["budget"]) || "none",
    files: (source.files_access as FeatureAccess["files"]) || "none",
  };
}

function detectTemplate(access: FeatureAccess): string {
  for (const [key, template] of Object.entries(ROLE_TEMPLATES)) {
    const t = template.access;
    if (
      access.customerView === t.customerView &&
      access.timeline === t.timeline &&
      access.tasks === t.tasks &&
      access.tasksScope === t.tasksScope &&
      access.spacePlanner === t.spacePlanner &&
      access.purchases === t.purchases &&
      access.purchasesScope === t.purchasesScope &&
      access.overview === t.overview &&
      access.teams === t.teams &&
      access.budget === t.budget &&
      access.files === t.files
    ) {
      return key;
    }
  }
  return "custom";
}

const TeamManagement = ({ projectId, isOwner, canManageTeam: canManageProp }: TeamManagementProps) => {
  const canManageTeam = canManageProp ?? isOwner;
  const [projectOwner, setProjectOwner] = useState<ProjectOwner | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [rotPersons, setRotPersons] = useState<{ id: string; name: string; personnummerLast4: string | null; profileId: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardV2State, setWizardV2State] = useState<{ open: boolean; path: InvitePath }>({
    open: false,
    path: "member",
  });
  const [wizardPrefill, setWizardPrefill] = useState<WorkerPrefill | undefined>(undefined);
  const [pendingDestructive, setPendingDestructive] = useState<
    | { kind: "member"; id: string; label: string }
    | { kind: "invitation"; id: string; label: string }
    | { kind: "worker"; id: string; label: string }
    | null
  >(null);

  const openInviteAsMember = () => {
    setWizardV2State({ open: true, path: "member" });
  };

  const openInviteAsWorker = () => {
    setWizardV2State({ open: true, path: "worker" });
  };

  const handleReinviteWorker = (row: TeamRow) => {
    const token = workerTokens.find((wt) => wt.id === row.id);
    if (!token) return;
    setWizardPrefill({
      name: token.worker_name || "",
      phone: token.worker_phone || "",
      email: token.worker_email || "",
      language: token.worker_language || "sv",
      taskIds: [...(token.assigned_task_ids || [])],
      canProposePurchases: token.can_create_purchases,
      canLogPurchases: token.can_log_receipts,
      replacesTokenId: token.id,
    });
    setWizardV2State({ open: true, path: "worker" });
  };
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<
    | { type: "member"; data: TeamMember }
    | { type: "invitation"; data: Invitation }
    | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [dmRecipient, setDmRecipient] = useState<{ id: string; name: string } | null>(null);
  const unreadCounts = useUnreadDmCounts(projectId, currentProfileId || "");
  const [workerTokens, setWorkerTokens] = useState<Array<{
    id: string; token: string; worker_name: string; worker_phone: string | null;
    worker_email: string | null; worker_language: string; assigned_task_ids: string[];
    expires_at: string; last_accessed_at: string | null; revoked_at: string | null;
    can_create_purchases: boolean; can_log_receipts: boolean; created_at: string;
  }>>([]);
  const [workerTaskNames, setWorkerTaskNames] = useState<Record<string, string>>({});
  const [workerEditOpen, setWorkerEditOpen] = useState(false);
  const [workerEditTarget, setWorkerEditTarget] = useState<{ id: string; name: string } | null>(null);
  const [workerEditCanCreatePurchases, setWorkerEditCanCreatePurchases] = useState(true);
  const [workerEditCanLogReceipts, setWorkerEditCanLogReceipts] = useState(false);

  // Shared with the edit-member dialog (still rendered below).
  const [inviteProfession, setInviteProfession] = useState<string>("other");
  const [selectedTemplate, setSelectedTemplate] = useState("contractor");
  const [isCoOwner, setIsCoOwner] = useState(false);
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess>({
    ...ROLE_TEMPLATES.contractor.access,
  });

  const { toast } = useToast();
  const { t } = useTranslation();
  const { showTaxDeduction } = useTaxDeductionVisible();

  // Tracks "X behörigheter ändrades" after a role swap. Cleared after a few seconds.
  const [lastTemplateDiff, setLastTemplateDiff] = useState<{
    count: number;
    template: string;
  } | null>(null);

  const countAccessDiff = (a: FeatureAccess, b: FeatureAccess): number => {
    let n = 0;
    (Object.keys(a) as Array<keyof FeatureAccess>).forEach((k) => {
      if (a[k] !== b[k]) n++;
    });
    return n;
  };

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    if (templateKey !== "custom" && ROLE_TEMPLATES[templateKey]) {
      const next = ROLE_TEMPLATES[templateKey].access;
      const diff = countAccessDiff(featureAccess, next);
      setFeatureAccess({ ...next });
      if (diff > 0) {
        setLastTemplateDiff({ count: diff, template: templateKey });
        setTimeout(() => setLastTemplateDiff(null), 4000);
      } else {
        setLastTemplateDiff(null);
      }
    }
  };

  const handleFeatureAccessChange = (updates: Partial<FeatureAccess>) => {
    const newAccess = { ...featureAccess, ...updates };
    setFeatureAccess(newAccess);
    setSelectedTemplate(detectTemplate(newAccess));
    setLastTemplateDiff(null);
  };

  const handleResetToTemplate = (templateKey: string) => {
    if (!ROLE_TEMPLATES[templateKey]) return;
    setFeatureAccess({ ...ROLE_TEMPLATES[templateKey].access });
    setSelectedTemplate(templateKey);
    setLastTemplateDiff(null);
  };

  useEffect(() => {
    fetchTeamData();
  }, [projectId]);

  const fetchTeamData = async () => {
    try {
      // Fetch project owner
      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .select("owner_id, profiles:owner_id ( id, name, email, phone, company_name )")
        .eq("id", projectId)
        .single();

      if (projectError) throw projectError;

      // Fetch current user profile ID for DM
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: myProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", authUser.id)
          .single();
        if (myProfile) setCurrentProfileId(myProfile.id);
      }

      if (projectData?.profiles) {
        const ownerProfile = projectData.profiles as unknown as { id: string; name: string; email: string; phone: string | null; company_name: string | null };
        setProjectOwner({
          id: ownerProfile.id,
          name: ownerProfile.name || "Unknown",
          email: ownerProfile.email || "",
          phone: ownerProfile.phone || null,
          company: ownerProfile.company_name || null,
        });
      }

      // Fetch team members (shares)
      const { data: sharesData, error: sharesError } = await supabase
        .from("project_shares")
        .select(
          `id, shared_with_user_id, role, role_type, contractor_category, contractor_role, phone, company, notes,
          display_name, display_email, created_at,
          customer_view_access, timeline_access, tasks_access, tasks_scope,
          space_planner_access, purchases_access, purchases_scope,
          overview_access, teams_access, budget_access, files_access,
          profiles:shared_with_user_id ( name, email )`
        )
        .eq("project_id", projectId);

      if (sharesError) throw sharesError;

      const teamMembers: TeamMember[] =
        (sharesData as unknown as Array<Record<string, unknown>>)?.map(
          (share) => {
            const profiles = share.profiles as Record<string, string> | null;
            // Use display_name/display_email if set, otherwise fall back to profiles
            const displayName = share.display_name as string | null;
            const displayEmail = share.display_email as string | null;
            return {
              id: share.id as string,
              profile_id: (share.shared_with_user_id as string) || "",
              user_name: displayName || profiles?.name || "Unknown",
              user_email: displayEmail || profiles?.email || "",
              role: share.role as string,
              role_type: share.role_type as TeamMember["role_type"],
              contractor_category: share.contractor_category as string | null,
              contractor_role: (share.contractor_role as string | null) ?? null,
              phone: share.phone as string | null,
              company: share.company as string | null,
              notes: share.notes as string | null,
              created_at: (share.created_at as string | null) ?? null,
              customer_view_access: share.customer_view_access as string | undefined,
              timeline_access: share.timeline_access as string | undefined,
              tasks_access: share.tasks_access as string | undefined,
              tasks_scope: share.tasks_scope as string | undefined,
              space_planner_access: share.space_planner_access as string | undefined,
              purchases_access: share.purchases_access as string | undefined,
              purchases_scope: share.purchases_scope as string | undefined,
              overview_access: share.overview_access as string | undefined,
              teams_access: share.teams_access as string | undefined,
              budget_access: share.budget_access as string | undefined,
              files_access: share.files_access as string | undefined,
            };
          }
        ) || [];

      setMembers(teamMembers);

      if (isOwner) {
        const { data: invitesData, error: invitesError } = await supabase
          .from("project_invitations")
          .select(
            `id, email, phone, delivery_method, role, status, created_at, token, contractor_role,
            timeline_access, tasks_access, tasks_scope, space_planner_access,
            purchases_access, purchases_scope, overview_access, teams_access,
            budget_access, files_access`
          )
          .eq("project_id", projectId)
          .eq("status", "pending")
          .order("created_at", { ascending: false });

        if (invitesError) throw invitesError;
        setInvitations((invitesData || []) as unknown as Invitation[]);
      }
      // Fetch worker tokens
      if (canManageTeam) {
        const { data: wTokens } = await supabase
          .from("worker_access_tokens")
          .select("id, token, worker_name, worker_phone, worker_email, worker_language, assigned_task_ids, expires_at, last_accessed_at, revoked_at, can_create_purchases, can_log_receipts, created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false });
        setWorkerTokens((wTokens || []) as typeof workerTokens);

        // Fetch task names for worker cards
        const allTaskIds = (wTokens || []).flatMap((w) => w.assigned_task_ids || []);
        if (allTaskIds.length > 0) {
          const uniqueIds = [...new Set(allTaskIds)];
          const { data: taskRows } = await supabase
            .from("tasks")
            .select("id, title")
            .in("id", uniqueIds);
          const nameMap: Record<string, string> = {};
          for (const t of taskRows || []) nameMap[t.id] = t.title;
          setWorkerTaskNames(nameMap);
        }
      }

      // Fetch ROT persons (non-account partners)
      const { data: rotData } = await supabase
        .from("project_rot_persons")
        .select("id, name, personnummer, profile_id")
        .eq("project_id", projectId);
      setRotPersons(
        (rotData || [])
          .filter((p) => !p.profile_id) // Only show those WITHOUT accounts (account holders appear as team members)
          .map((p) => ({
            id: p.id,
            name: p.name,
            personnummerLast4: p.personnummer ? p.personnummer.slice(-4) : null,
            profileId: p.profile_id,
          }))
      );
    } catch (error: unknown) {
      toast({
        title: t("roles.error"),
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  const openEditDialog = (
    target:
      | { type: "member"; data: TeamMember }
      | { type: "invitation"; data: Invitation }
  ) => {
    setEditTarget(target);
    const access = dbToAccess(
      target.data,
      target.type === "invitation" ? "view" : "none"
    );
    setFeatureAccess(access);
    setSelectedTemplate(detectTemplate(access));
    // Seed profession state from existing contractor_role (only for members; invitations carry it too)
    const currentProfession =
      target.type === "member"
        ? ((target.data as TeamMember & { contractor_role?: string }).contractor_role || "other")
        : ((target.data as Invitation & { contractor_role?: string }).contractor_role || "other");
    setInviteProfession(currentProfession);
    // Seed co-owner state from existing role_type (members only — invitations don't surface it as a column)
    if (target.type === "member") {
      const currentRoleType = (target.data as TeamMember).role_type;
      setIsCoOwner(currentRoleType === "co_owner");
    } else {
      setIsCoOwner(false);
    }
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);

    try {
      const permDb = accessToDb(featureAccess);
      const role = selectedTemplate !== "custom" ? selectedTemplate : "viewer";

      const contractorRole = selectedTemplate === "contractor" ? inviteProfession : "other";

      if (editTarget.type === "member") {
        // Persist co-owner status alongside role/permissions so the Skatteinformation
        // section in this dialog is the single source of truth post-invite.
        const roleType = isCoOwner ? "co_owner" : null;
        const { error } = await supabase
          .from("project_shares")
          .update({
            role,
            role_type: roleType,
            contractor_role: contractorRole,
            ...permDb,
          } as Record<string, unknown>)
          .eq("id", editTarget.data.id);
        if (error) throw error;
        toast({
          title: t("roles.memberUpdated"),
          description: t("roles.memberUpdatedDescription"),
        });
      } else {
        const { error } = await supabase
          .from("project_invitations")
          .update({
            role,
            contractor_role: contractorRole,
            ...permDb,
            permissions_snapshot: permDb,
          } as Record<string, unknown>)
          .eq("id", editTarget.data.id);
        if (error) throw error;
        toast({
          title: t("roles.invitationUpdated"),
          description: t("roles.invitationUpdatedDescription"),
        });
      }

      setEditDialogOpen(false);
      setEditTarget(null);
      fetchTeamData();
    } catch (error: unknown) {
      toast({
        title: t("roles.error"),
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!isOwner) return;
    setDeleting(memberId);
    try {
      const { error } = await supabase
        .from("project_shares")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
      toast({
        title: t("roles.memberRemoved"),
        description: t("roles.memberRemovedDescription"),
      });
      fetchTeamData();
    } catch (error: unknown) {
      toast({
        title: t("roles.error"),
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from("project_invitations")
        .delete()
        .eq("id", invitationId);
      if (error) throw error;
      toast({
        title: t("roles.invitationCancelled"),
        description: t("roles.invitationCancelledDescription"),
      });
      fetchTeamData();
    } catch (error: unknown) {
      toast({
        title: t("roles.error"),
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const openWorkerEditDialog = (tokenId: string) => {
    const wt = workerTokens.find((w) => w.id === tokenId);
    if (!wt) return;
    setWorkerEditTarget({ id: wt.id, name: wt.worker_name });
    setWorkerEditCanCreatePurchases(wt.can_create_purchases ?? true);
    setWorkerEditCanLogReceipts(wt.can_log_receipts ?? false);
    setWorkerEditOpen(true);
  };

  const handleSaveWorkerEdit = async () => {
    if (!workerEditTarget) return;
    try {
      const { error } = await supabase
        .from("worker_access_tokens")
        .update({
          can_create_purchases: workerEditCanCreatePurchases,
          can_log_receipts: workerEditCanLogReceipts,
        })
        .eq("id", workerEditTarget.id);
      if (error) throw error;
      toast({
        title: t("teamWorker.permissionsUpdated", "Permissions updated"),
        description: t("teamWorker.permissionsUpdatedDescription", "Worker permissions have been saved."),
      });
      setWorkerEditOpen(false);
      setWorkerEditTarget(null);
      fetchTeamData();
    } catch (error: unknown) {
      toast({ title: t("roles.error"), description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleRevokeWorker = async (tokenId: string) => {
    try {
      await supabase
        .from("worker_access_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", tokenId);
      toast({ title: t("teamWorker.revoked", "Access revoked") });
      fetchTeamData();
    } catch (error: unknown) {
      toast({ title: t("roles.error"), description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleCopyWorkerLink = async (token: string) => {
    const appOrigin = window.location.hostname === "localhost"
      ? "https://app.renofine.com"
      : window.location.origin;
    const link = `${appOrigin}/w/${token}`;
    await navigator.clipboard.writeText(link);
    toast({ description: t("teamWorker.linkCopied", "Link copied to clipboard") });
  };

  const handleResendInvitation = async (invitationId: string) => {
    setResending(invitationId);
    try {
      const { error } = await supabase.functions.invoke(
        "send-project-invitation",
        { body: { invitationId } }
      );
      if (error) throw error;
      toast({
        title: t("roles.invitationResent"),
        description: t("roles.invitationResentDescription"),
      });
    } catch (error: unknown) {
      console.error("Error resending invitation:", error);
      toast({
        title: t("roles.error"),
        description: t("roles.resendFailed"),
        variant: "destructive",
      });
    } finally {
      setResending(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "accepted":
        return <CheckCircle className="h-4 w-4 text-success" />;
      case "declined":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "expired":
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Clock className="h-4 w-4 text-warning" />;
    }
  };

  const getMemberRoleLabel = (member: TeamMember): string => {
    const detected = detectTemplate(dbToAccess(member));
    if (detected !== "custom") {
      return t(`roles.roleTemplates.${detected}`);
    }
    return t("roles.roleTemplates.custom");
  };

  // Build unified rows for TeamTable
  const teamRows: TeamRow[] = useMemo(() => {
    const rows: TeamRow[] = [];

    // 1. Owner
    if (projectOwner) {
      rows.push({
        id: `owner-${projectOwner.id}`,
        type: "owner",
        name: projectOwner.name,
        email: projectOwner.email,
        phone: projectOwner.phone,
        role: t("roles.projectOwner", "Owner"),
        roleTemplate: "owner",
        status: "active",
        addedDate: null,
        profileId: projectOwner.id,
        featureAccess: null,
        company: projectOwner.company,
        contractorCategory: null,
        notes: null,
        assignedTaskIds: null,
        assignedTaskNames: null,
        workerLanguage: null,
        workerToken: null,
        personnummerLast4: null,
      });
    }

    // 2. Members
    for (const m of members) {
      const access = dbToAccess(m);
      rows.push({
        id: m.id,
        type: "member",
        name: m.user_name,
        email: m.user_email || null,
        phone: m.phone,
        role: getMemberRoleLabel(m),
        roleTemplate: detectTemplate(access),
        status: "active",
        addedDate: m.created_at,
        profileId: m.profile_id || null,
        featureAccess: access,
        company: m.company,
        contractorCategory:
          m.contractor_category ||
          (m.contractor_role && m.contractor_role !== "other"
            ? t(`professions.${m.contractor_role}`, m.contractor_role)
            : null),
        notes: m.notes,
        assignedTaskIds: null,
        assignedTaskNames: null,
        workerLanguage: null,
        workerToken: null,
        personnummerLast4: null,
      });
    }

    // 3. Pending invitations
    for (const inv of invitations) {
      const access = dbToAccess(inv, "view");
      rows.push({
        id: inv.id,
        type: "invitation",
        name: inv.email,
        email: inv.email,
        phone: inv.phone || null,
        role: t(`roles.roleTemplates.${detectTemplate(access)}`),
        roleTemplate: detectTemplate(access),
        status: inv.status === "pending" ? "pending" : "expired",
        addedDate: inv.created_at,
        profileId: null,
        featureAccess: access,
        company: null,
        contractorCategory:
          inv.contractor_role && inv.contractor_role !== "other"
            ? t(`professions.${inv.contractor_role}`, inv.contractor_role)
            : null,
        notes: null,
        assignedTaskIds: null,
        assignedTaskNames: null,
        workerLanguage: null,
        workerToken: null,
        personnummerLast4: null,
      });
    }

    // 4. Workers
    for (const wt of workerTokens) {
      const isExpired = new Date(wt.expires_at) < new Date();
      const isRevoked = !!wt.revoked_at;
      const taskNames = (wt.assigned_task_ids || []).map((id) => workerTaskNames[id] || id);
      rows.push({
        id: wt.id,
        type: "worker",
        name: wt.worker_name,
        email: wt.worker_email,
        phone: wt.worker_phone,
        role: t("team.roles.worker", "Worker"),
        roleTemplate: "worker",
        status: isRevoked ? "revoked" : isExpired ? "expired" : "active",
        addedDate: wt.created_at,
        profileId: null,
        featureAccess: null,
        company: null,
        contractorCategory: null,
        notes: null,
        assignedTaskIds: wt.assigned_task_ids,
        assignedTaskNames: taskNames,
        workerLanguage: wt.worker_language,
        workerToken: wt.token,
        personnummerLast4: null,
      });
    }

    // 5. ROT persons
    for (const rp of rotPersons) {
      rows.push({
        id: rp.id,
        type: "rot",
        name: rp.name,
        email: null,
        phone: null,
        role: t("team.roles.rotPerson", "ROT person"),
        roleTemplate: "rot",
        status: "active",
        addedDate: null,
        profileId: null,
        featureAccess: null,
        company: null,
        contractorCategory: null,
        notes: null,
        assignedTaskIds: null,
        assignedTaskNames: null,
        workerLanguage: null,
        workerToken: null,
        personnummerLast4: rp.personnummerLast4,
      });
    }

    return rows;
  }, [projectOwner, members, invitations, workerTokens, rotPersons, workerTaskNames, t]);

  // Handlers for TeamTable
  const handleTableEdit = (row: TeamRow) => {
    if (row.type === "member") {
      const member = members.find((m) => m.id === row.id);
      if (member) openEditDialog({ type: "member", data: member });
    } else if (row.type === "invitation") {
      const inv = invitations.find((i) => i.id === row.id);
      if (inv) openEditDialog({ type: "invitation", data: inv });
    } else if (row.type === "worker") {
      openWorkerEditDialog(row.id);
    }
  };

  const handleTableDelete = async (row: TeamRow) => {
    if (row.type === "member") {
      setPendingDestructive({ kind: "member", id: row.id, label: row.name || row.email || "" });
    } else if (row.type === "invitation") {
      setPendingDestructive({ kind: "invitation", id: row.id, label: row.email || "" });
    } else if (row.type === "worker") {
      setPendingDestructive({ kind: "worker", id: row.id, label: row.name || "" });
    } else if (row.type === "rot") {
      await supabase.from("project_rot_persons").delete().eq("id", row.id);
      fetchTeamData();
    }
  };

  const confirmDestructive = async () => {
    if (!pendingDestructive) return;
    const action = pendingDestructive;
    setPendingDestructive(null);
    if (action.kind === "member") await handleDeleteMember(action.id);
    else if (action.kind === "invitation") await handleCancelInvitation(action.id);
    else if (action.kind === "worker") await handleRevokeWorker(action.id);
  };

  const destructiveCopy = pendingDestructive
    ? pendingDestructive.kind === "member"
      ? {
          title: t("roles.confirmRemoveMemberTitle", "Ta bort medlem från projektet?"),
          description: t(
            "roles.confirmRemoveMemberDescription",
            "Medlemmen tappar all åtkomst till projektet. Tidigare bidrag (kommentarer, filer) finns kvar.",
          ),
          action: t("common.remove", "Ta bort"),
          cancel: t("roles.confirmRemoveMemberKeep", "Behåll medlem"),
        }
      : pendingDestructive.kind === "invitation"
        ? {
            title: t("roles.confirmCancelInviteTitle", "Avbryta inbjudan?"),
            description: t(
              "roles.confirmCancelInviteDescription",
              "Inbjudningslänken slutar fungera direkt. Du kan skicka en ny inbjudan när som helst.",
            ),
            action: t("roles.cancelInvitation", "Avbryt inbjudan"),
            cancel: t("roles.confirmCancelInviteKeep", "Behåll inbjudan"),
          }
        : {
            title: t("roles.confirmRevokeWorkerTitle", "Återkalla arbetarens åtkomst?"),
            description: t(
              "roles.confirmRevokeWorkerDescription",
              "Länken slutar fungera direkt. Du kan skapa en ny inbjudan när som helst.",
            ),
            action: t("teamWorker.revoke", "Återkalla"),
            cancel: t("roles.confirmRevokeWorkerKeep", "Behåll åtkomst"),
          }
    : null;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Users className="h-5 w-5 text-primary shrink-0" />
          <h2 className="font-display text-xl font-normal tracking-tight">{t("roles.title")}</h2>
        </div>
        {canManageTeam && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openInviteAsWorker}>
              <Wrench className="h-4 w-4 mr-2" />
              {t("roles.sendJobButton", "Skicka jobb")}
            </Button>
            <Button onClick={openInviteAsMember}>
              <UserPlus className="h-4 w-4 mr-2" />
              {t("roles.addMemberButton", "Lägg till medlem")}
            </Button>
          </div>
        )}
      </div>


      {/* Unified Team Table */}
      <Card>
        <CardContent className="p-0">
          <TeamTable
            rows={teamRows}
            currentProfileId={currentProfileId}
            canManageTeam={canManageTeam}
            isOwner={isOwner}
            onEdit={handleTableEdit}
            onDelete={handleTableDelete}
            onCopyLink={handleCopyWorkerLink}
            onDm={(profileId, name) => setDmRecipient({ id: profileId, name })}
            onReinviteWorker={handleReinviteWorker}
          />
        </CardContent>
      </Card>

      {/* ROT person add form (owner only) */}
      {isOwner && showTaxDeduction && (
        <Card>
          <CardContent className="pt-4">
            <RotPersonAddForm projectId={projectId} onAdded={fetchTeamData} t={t} />
          </CardContent>
        </Card>
      )}




      {/* Unified Edit Dialog (members + invitations) */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editTarget?.type === "member"
                ? t("roles.editMemberTitle")
                : t("roles.editInvitationTitle")}
            </DialogTitle>
            <DialogDescription>
              {editTarget?.type === "member"
                ? t("roles.editMemberDescription", {
                    name: (editTarget.data as TeamMember).user_name,
                  })
                : t("roles.editInvitationDescription", {
                    email: (editTarget?.data as Invitation)?.email,
                  })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 overflow-y-auto flex-1 pr-2">
            {/* Role Cards */}
            <div className="space-y-2">
              <Label>{t("roles.selectRole")}</Label>
              <RoleCardGrid
                selected={selectedTemplate}
                onSelect={handleTemplateChange}
                t={t}
                hideWorker
              />
            </div>

            {/* Profession — only for the Contractor role */}
            {selectedTemplate === "contractor" && (
              <div className="space-y-2">
                <Label htmlFor="edit-profession">
                  {t("professions.selectLabel", "Yrke")}
                </Label>
                <Select
                  value={inviteProfession}
                  onValueChange={setInviteProfession}
                >
                  <SelectTrigger id="edit-profession">
                    <SelectValue placeholder={t("professions.selectPlaceholder", "Välj yrke...")} />
                  </SelectTrigger>
                  <SelectContent>
                    {PROFESSION_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {t(`professions.${key}`, key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Custom-access reset banner — only shown when permissions don't match any template */}
            {selectedTemplate === "custom" && isOwner && (
              <div className="rounded-md border border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/30 p-3 text-sm">
                <div className="font-medium text-foreground mb-1">
                  {t("roles.customStateTitle", "Anpassade behörigheter")}
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  {t(
                    "roles.customStateDescription",
                    "Behörigheterna matchar inte någon färdig rollmall. Välj en roll ovan för att börja om från en mall, eller justera fält direkt nedan.",
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {["contractor", "project_manager", "client", "collaborator"].map((key) => (
                    <Button
                      key={key}
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => handleResetToTemplate(key)}
                    >
                      {t("roles.resetToTemplate", "Återställ till {{role}}", {
                        role: t(`roles.roleTemplates.${key}`),
                      })}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Consequence list — what this member can actually see */}
            <AccessConsequenceList
              access={featureAccess}
              personName={
                editTarget?.type === "member"
                  ? (editTarget.data as TeamMember).user_name
                  : (editTarget?.data as Invitation)?.email
              }
            />

            {/* Permissions — compact dropdown-per-feature list */}
            <Collapsible defaultOpen={selectedTemplate === "custom"}>
              <div className="flex items-center justify-between gap-2">
                <CollapsibleTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-90" />
                  {t("roles.permissions", "Permissions")}
                </CollapsibleTrigger>
                {lastTemplateDiff && (
                  <span className="text-xs text-muted-foreground italic animate-in fade-in">
                    {t("roles.templateDiffNotice", {
                      count: lastTemplateDiff.count,
                      defaultValue: "{{count}} behörigheter ändrades av rollvalet",
                    })}
                  </span>
                )}
              </div>
              <CollapsibleContent>
                <div className="pt-2">
                  <FeatureAccessEditor
                    featureAccess={featureAccess}
                    onChange={handleFeatureAccessChange}
                    idPrefix="edit"
                    readOnly={!isOwner}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Skatteinformation — only on member profile (not invitations).
                Co-owner toggle moved here from the invite flow so a PL can be
                marked as ROT-co-owner after accepting; invite step keeps the
                same toggle until the V2 wizard fully replaces the legacy flow. */}
            {editTarget?.type === "member" &&
              selectedTemplate === "project_manager" &&
              showTaxDeduction &&
              isOwner && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("roles.taxSectionTitle", "Skatteinformation")}
                  </div>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={isCoOwner}
                      onCheckedChange={(checked) => setIsCoOwner(!!checked)}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-medium">
                        {t("roles.coOwnerOption", "Co-owner (double ROT)")}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "roles.coOwnerOptionDesc",
                          "Same access as owner + doubles ROT deduction to 100,000 kr",
                        )}
                      </p>
                    </div>
                  </label>
                </div>
              )}
          </div>

          <div className="flex gap-3 pt-4 border-t shrink-0">
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={saving}
            >
              {t("roles.cancel")}
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving} className="flex-1">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("roles.saveChanges")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Worker permissions edit dialog */}
      <Dialog open={workerEditOpen} onOpenChange={setWorkerEditOpen}>
        <DialogContent className="max-w-md w-[95vw]">
          <DialogHeader>
            <DialogTitle>
              {t("teamWorker.editPermissionsTitle", "Redigera arbetar-behörighet")}
            </DialogTitle>
            <DialogDescription>
              {workerEditTarget?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("teamWorker.purchasePermissions", "Inköp")}
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <Label htmlFor="worker-edit-can-create-purchases" className="text-sm cursor-pointer">
                  {t("teamWorker.canCreatePurchases", "Kan föreslå inköp")}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {t("teamWorker.canCreatePurchasesDesc", "Skapar förslag som du godkänner")}
                </p>
              </div>
              <Switch
                id="worker-edit-can-create-purchases"
                checked={workerEditCanCreatePurchases}
                onCheckedChange={setWorkerEditCanCreatePurchases}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <Label htmlFor="worker-edit-can-log-receipts" className="text-sm cursor-pointer">
                  {t("teamWorker.canLogReceipts", "Kan logga utförda inköp")}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {t("teamWorker.canLogReceiptsDesc", "Workern kan registrera och bifoga kvitto direkt — kringgår godkännande")}
                </p>
              </div>
              <Switch
                id="worker-edit-can-log-receipts"
                checked={workerEditCanLogReceipts}
                onCheckedChange={setWorkerEditCanLogReceipts}
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setWorkerEditOpen(false)}>
              {t("roles.cancel")}
            </Button>
            <Button onClick={handleSaveWorkerEdit} className="flex-1">
              {t("roles.saveChanges")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Empty state */}
      {members.length === 0 && invitations.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <UserPlus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {t("roles.noMembers")}
            </h3>
            <p className="text-muted-foreground mb-4">
              {t("roles.noMembersDescription")}
            </p>
            {canManageTeam && (
              <Button onClick={openInviteAsMember}>
                <UserPlus className="h-4 w-4 mr-2" />
                {t("roles.inviteButton")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      {/* Direct Message Sheet */}
      {currentProfileId && dmRecipient && (
        <DirectMessageSheet
          open={!!dmRecipient}
          onOpenChange={(o) => { if (!o) setDmRecipient(null); }}
          projectId={projectId}
          currentUserId={currentProfileId}
          recipient={dmRecipient}
        />
      )}

      {/* Destructive action confirmation */}
      <AlertDialog
        open={!!pendingDestructive}
        onOpenChange={(o) => { if (!o) setPendingDestructive(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{destructiveCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {destructiveCopy?.description}
              {pendingDestructive?.label && (
                <span className="mt-2 block font-medium text-foreground">
                  {pendingDestructive.label}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {destructiveCopy?.cancel || t("common.cancel", "Avbryt")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDestructive}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {destructiveCopy?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {wizardV2State.open && (
        <InviteWizard
          open={wizardV2State.open}
          onOpenChange={(open) => {
            setWizardV2State((prev) => ({ ...prev, open }));
            if (!open) setWizardPrefill(undefined);
          }}
          initialPath={wizardV2State.path}
          projectId={projectId}
          prefillWorker={wizardPrefill}
          existingMemberEmails={members
            .map((m) => (m.user_email || "").trim().toLowerCase())
            .filter(Boolean)}
          existingInvitationEmails={invitations
            .map((i) => (i.email || "").trim().toLowerCase())
            .filter(Boolean)}
          existingWorkerContacts={{
            emails: workerTokens
              .filter((w) => !w.revoked_at)
              .map((w) => (w.worker_email || "").trim().toLowerCase())
              .filter(Boolean),
            phones: workerTokens
              .filter((w) => !w.revoked_at)
              .map((w) => (w.worker_phone || "").trim())
              .filter(Boolean),
          }}
          onInviteSent={fetchTeamData}
        />
      )}
    </div>
  );
};

/* ── Role Card Grid ─────────────────────────────────────────── */

/* ── ROT Person Add Form ───────────────────────────────────── */

function RotPersonAddForm({ projectId, onAdded, t }: { projectId: string; onAdded: () => void; t: (key: string, fallback?: string) => string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pnr, setPnr] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("project_rot_persons").insert({
      project_id: projectId,
      name: name.trim(),
      personnummer: pnr.trim() || null,
    });
    if (error) {
      console.error("Error adding ROT person:", error);
    } else {
      setName("");
      setPnr("");
      setOpen(false);
      onAdded();
    }
    setSaving(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full p-2.5 border border-dashed rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
      >
        <UserPlus className="h-4 w-4" />
        {t("roles.addRotPerson", "Lägg till ROT-person")}
      </button>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 p-2.5 border rounded-lg bg-muted/30">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("rot.namePlaceholder", "Namn")}
        className="h-8 text-sm flex-1"
        autoFocus
      />
      <Input
        value={pnr}
        onChange={(e) => setPnr(e.target.value)}
        placeholder={t("rot.pnrPlaceholder", "Personnummer")}
        className="h-8 text-sm flex-1"
      />
      <div className="flex gap-1 shrink-0">
        <Button size="sm" className="h-8" onClick={handleAdd} disabled={!name.trim() || saving}>
          {t("common.add", "Lägg till")}
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={() => { setOpen(false); setName(""); setPnr(""); }}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ── Role Card Grid ─────────────────────────────────────────── */

interface RoleCardGridProps {
  selected: string;
  onSelect: (key: string) => void;
  t: (key: string, fallback?: string) => string;
  /** Compact horizontal pills instead of big cards */
  compact?: boolean;
  /** Hide the worker card (worker invite lives in a separate flow now) */
  hideWorker?: boolean;
}

function RoleCardGrid({ selected, onSelect, t, compact, hideWorker }: RoleCardGridProps) {
  const templateKeys = Object.keys(ROLE_TEMPLATES).filter(
    (k) => !(hideWorker && k === "worker"),
  );
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {templateKeys.map((key) => {
          const Icon = ROLE_ICONS[key] || User;
          const isSelected = selected === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                isSelected
                  ? "border-2 border-primary bg-primary/5 font-medium"
                  : "border border-border hover:border-primary/50 text-muted-foreground"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isSelected ? "text-primary" : ""}`} />
              {t(`roles.roleTemplates.${key}`, key)}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {templateKeys.map((key) => {
        const Icon = ROLE_ICONS[key] || User;
        const isSelected = selected === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={`p-3 rounded-lg text-left transition-colors ${
              isSelected
                ? "border-2 border-primary bg-primary/5 shadow-sm"
                : "border border-border hover:border-primary/50"
            }`}
          >
            <Icon
              className={`h-5 w-5 mb-1.5 ${
                isSelected ? "text-primary" : "text-muted-foreground"
              }`}
            />
            <div className="font-medium text-sm">
              {t(`roles.roleTemplates.${key}`, key)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {t(`roles.cards.${key}.description`, "")}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ── Role Info Panel ────────────────────────────────────────── */

const ACCESS_LABEL_KEYS: Record<string, string> = {
  none: "roles.accessNone",
  view: "roles.accessView",
  edit: "roles.accessEdit",
  create: "roles.accessCreate",
  upload: "roles.accessUpload",
  invite: "roles.accessInvite",
};

const FEATURE_LABEL_KEYS = [
  { key: "customerView" as const, labelKey: "roles.featureCustomerView" },
  { key: "timeline" as const, labelKey: "roles.featureTimeline" },
  { key: "tasks" as const, labelKey: "roles.featureTasks" },
  { key: "spacePlanner" as const, labelKey: "roles.featureSpacePlanner" },
  { key: "purchases" as const, labelKey: "roles.featurePurchaseOrders" },
  { key: "overview" as const, labelKey: "roles.featureOverview" },
  { key: "teams" as const, labelKey: "roles.featureTeamManagement" },
  { key: "budget" as const, labelKey: "roles.featureBudget" },
  { key: "files" as const, labelKey: "roles.featureFiles" },
];

interface RoleInfoPanelProps {
  templateKey: string;
  t: (key: string, fallback?: string) => string;
}

function RoleInfoPanel({ templateKey, t }: RoleInfoPanelProps) {
  const template =
    ROLE_TEMPLATES[templateKey]?.access || ROLE_TEMPLATES.contractor.access;

  return (
    <div className="mt-2 p-3 bg-muted/50 rounded-lg text-sm space-y-1">
      {FEATURE_LABEL_KEYS.map(({ key, labelKey }) => {
        const level = template[key];
        if (level === "none") return null;
        return (
          <div key={key} className="flex justify-between">
            <span className="text-muted-foreground">{t(labelKey)}</span>
            <span className="font-medium">
              {t(ACCESS_LABEL_KEYS[level] || level)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default TeamManagement;
