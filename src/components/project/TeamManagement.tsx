import { useEffect, useState } from "react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import {
  UserPlus,
  Mail,
  Phone,
  ChevronDown,
  X,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Pencil,
  Send,
  ChevronRight,
  Wrench,
  ClipboardList,
  User,
  Eye,
  Crown,
  Ruler,
  Users,
  Shield,
} from "lucide-react";
import { z } from "zod";
import { getAvatarColor } from "@/lib/avatarColor";
import { FeatureAccessEditor } from "./team/FeatureAccessEditor";
import type { FeatureAccess } from "./team/FeatureAccessEditor";
import { DirectMessageSheet } from "./DirectMessageSheet";
import { InviteWorkerDialog } from "./team/InviteWorkerDialog";
import { useUnreadDmCounts } from "@/hooks/useDirectMessages";
import { MessageCircle } from "lucide-react";

interface TeamMember {
  id: string;
  profile_id: string;
  user_name: string;
  user_email: string;
  role: string;
  role_type: "contractor" | "client" | "other" | null;
  contractor_category: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
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
      timeline: "none",
      tasks: "none",
      tasksScope: "all",
      spacePlanner: "none",
      purchases: "none",
      purchasesScope: "all",
      overview: "none",
      teams: "none",
      budget: "none",
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

const LANG_FLAGS: Record<string, string> = {
  sv: "\u{1F1F8}\u{1F1EA}", en: "\u{1F1EC}\u{1F1E7}", uk: "\u{1F1FA}\u{1F1E6}",
  pl: "\u{1F1F5}\u{1F1F1}", ro: "\u{1F1F7}\u{1F1F4}", lt: "\u{1F1F1}\u{1F1F9}",
  et: "\u{1F1EA}\u{1F1EA}", de: "\u{1F1E9}\u{1F1EA}", fr: "\u{1F1EB}\u{1F1F7}", es: "\u{1F1EA}\u{1F1F8}",
};

const TeamManagement = ({ projectId, isOwner, canManageTeam: canManageProp }: TeamManagementProps) => {
  const canManageTeam = canManageProp ?? isOwner;
  const [projectOwner, setProjectOwner] = useState<ProjectOwner | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [rotPersons, setRotPersons] = useState<{ id: string; name: string; personnummerLast4: string | null; profileId: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
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
  const [workerDialogOpen, setWorkerDialogOpen] = useState(false);
  const [workerTokens, setWorkerTokens] = useState<Array<{
    id: string; token: string; worker_name: string; worker_phone: string | null;
    worker_email: string | null; worker_language: string; assigned_task_ids: string[];
    expires_at: string; last_accessed_at: string | null; revoked_at: string | null;
  }>>([]);
  const [expandedWorkerId, setExpandedWorkerId] = useState<string | null>(null);
  const [workerTaskNames, setWorkerTaskNames] = useState<Record<string, string>>({});

  // Invite form state
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("contractor");
  const [isCoOwner, setIsCoOwner] = useState(false);
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess>({
    ...ROLE_TEMPLATES.contractor.access,
  });

  const { toast } = useToast();
  const { t } = useTranslation();
  const { showTaxDeduction } = useTaxDeductionVisible();

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    if (templateKey !== "custom" && ROLE_TEMPLATES[templateKey]) {
      setFeatureAccess({ ...ROLE_TEMPLATES[templateKey].access });
    }
  };

  const handleFeatureAccessChange = (updates: Partial<FeatureAccess>) => {
    const newAccess = { ...featureAccess, ...updates };
    setFeatureAccess(newAccess);
    setSelectedTemplate(detectTemplate(newAccess));
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
          `id, shared_with_user_id, role, role_type, contractor_category, phone, company, notes,
          display_name, display_email,
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
              phone: share.phone as string | null,
              company: share.company as string | null,
              notes: share.notes as string | null,
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
            `id, email, phone, delivery_method, role, status, created_at, token,
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
          .select("id, token, worker_name, worker_phone, worker_email, worker_language, assigned_task_ids, expires_at, last_accessed_at, revoked_at")
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

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);

    try {
      const validated = invitationSchemaEmail.parse({ email: inviteEmail });

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) throw new Error("Profile not found");

      const permDb = accessToDb(featureAccess);
      const { data: invitationData, error } = await supabase
        .from("project_invitations")
        .insert({
          project_id: projectId,
          invited_by_user_id: profile.id,
          invited_email: validated.email,
          invited_name: inviteName.trim() || null,
          contractor_role: "other",
          role: isCoOwner ? "homeowner" : (selectedTemplate !== "custom" ? selectedTemplate : "collaborator"),
          role_type: isCoOwner ? "co_owner" : null,
          permissions_snapshot: { ...permDb, role_type: isCoOwner ? "co_owner" : null },
        } as Record<string, unknown>)
        .select()
        .single();

      if (error) throw error;

      try {
        const { error: sendError } = await supabase.functions.invoke(
          "send-project-invitation",
          { body: { invitationId: invitationData.id } }
        );
        if (sendError) {
          console.error("Error sending invitation:", sendError);
          toast({
            title: t("roles.invitationCreated"),
            description: t("roles.invitationCreatedEmailFailed"),
            variant: "destructive",
          });
        } else {
          toast({
            title: t("roles.invitationSent"),
            description: t("roles.invitationSentDescription"),
          });
        }
      } catch (sendErr: unknown) {
        console.error("Send error:", sendErr);
        toast({
          title: t("roles.invitationCreated"),
          description: t("roles.invitationSavedEmailFailed"),
          variant: "destructive",
        });
      }

      setDialogOpen(false);
      setInviteName("");
      setInviteEmail("");
      setSelectedTemplate("contractor");
      setIsCoOwner(false);
      setFeatureAccess({ ...ROLE_TEMPLATES.contractor.access });
      fetchTeamData();
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        toast({
          title: t("roles.validationError"),
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: t("roles.error"),
          description: (error as Error).message,
          variant: "destructive",
        });
      }
    } finally {
      setInviting(false);
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
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);

    try {
      const permDb = accessToDb(featureAccess);
      const role = selectedTemplate !== "custom" ? selectedTemplate : "viewer";

      if (editTarget.type === "member") {
        const { error } = await supabase
          .from("project_shares")
          .update({ role, ...permDb })
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
    if (!isOwner || !confirm(t("roles.confirmRemoveMember"))) return;
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
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                {t("roles.inviteButton")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>{t("roles.inviteTitle")}</DialogTitle>
                <DialogDescription>
                  {t("roles.inviteDescription")}
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={handleSendInvitation}
                className="space-y-5 overflow-y-auto flex-1 pr-2"
              >
                {/* Name (optional) */}
                <div className="space-y-2">
                  <Label htmlFor="invite-name">{t("roles.nameLabel")}</Label>
                  <Input
                    id="invite-name"
                    placeholder={t("roles.namePlaceholder")}
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="invite-email">
                    {t("roles.emailLabel")} *
                  </Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder={t("roles.emailPlaceholder")}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>

                {/* Role Cards */}
                <div className="space-y-2">
                  <Label>{t("roles.selectRole")}</Label>
                  <RoleCardGrid
                    selected={selectedTemplate}
                    onSelect={handleTemplateChange}
                    t={t}
                  />
                </div>

                {/* Permissions — compact dropdown-per-feature list */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-90" />
                    {t("roles.permissions", "Permissions")}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pt-2">
                      <FeatureAccessEditor
                        featureAccess={featureAccess}
                        onChange={handleFeatureAccessChange}
                        idPrefix="invite"
                        readOnly={!isOwner}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Co-owner checkbox — only for project_manager on Swedish projects */}
                {selectedTemplate === "project_manager" && showTaxDeduction && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg border hover:bg-accent transition-colors">
                    <Checkbox
                      checked={isCoOwner}
                      onCheckedChange={(checked) => setIsCoOwner(!!checked)}
                    />
                    <div>
                      <span className="font-medium">{t("roles.coOwnerOption", "Co-owner (double ROT)")}</span>
                      <p className="text-xs text-muted-foreground">{t("roles.coOwnerOptionDesc", "Same access as owner + doubles ROT deduction to 100,000 kr")}</p>
                    </div>
                  </label>
                )}

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={inviting}>
                    {inviting && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {t("roles.sendInvitation")}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* All Team Members (owner + shares) */}
      {(projectOwner || members.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>{t("roles.teamMembers")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Project Owner — always first */}
            {projectOwner && (
              <div className="flex items-center gap-3 p-3 border border-border rounded-lg bg-primary/5">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium shrink-0">
                  <Crown className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{projectOwner.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{projectOwner.email}</p>
                  {(projectOwner.company || projectOwner.phone) && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {[projectOwner.company, projectOwner.phone].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {t("roles.projectOwner", "Ägare")}
                </span>
              </div>
            )}
            {/* Shared members */}
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 p-3 border border-border rounded-lg"
              >
                <div className="relative shrink-0">
                  <button
                    onClick={() => {
                      if (currentProfileId && member.profile_id && member.profile_id !== currentProfileId) {
                        setDmRecipient({ id: member.profile_id, name: member.user_name });
                      }
                    }}
                    className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium ${getAvatarColor(member.user_name)} ${
                      currentProfileId && member.profile_id && member.profile_id !== currentProfileId
                        ? "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                        : ""
                    }`}
                    title={currentProfileId && member.profile_id !== currentProfileId ? t("dm.openChat", "Skicka meddelande") : undefined}
                  >
                    {member.user_name.charAt(0).toUpperCase()}
                  </button>
                  {unreadCounts[member.profile_id] > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {unreadCounts[member.profile_id] > 9 ? "9+" : unreadCounts[member.profile_id]}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{member.user_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{member.user_email}</p>
                  {(member.company || member.phone) && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {[member.company, member.phone].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <span className="hidden sm:inline text-sm text-muted-foreground whitespace-nowrap">
                  {getMemberRoleLabel(member)}
                  {member.contractor_category && (
                    <span className="text-xs">
                      {" · "}
                      {t(`roles.contractorRoles.${member.contractor_category}`, member.contractor_category)}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {currentProfileId && member.profile_id && member.profile_id !== currentProfileId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setDmRecipient({ id: member.profile_id, name: member.user_name })}
                      title={t("dm.openChat", "Skicka meddelande")}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                {canManageTeam && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        openEditDialog({ type: "member", data: member })
                      }
                      title={t("roles.editMember")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDeleteMember(member.id)}
                        disabled={deleting === member.id}
                        title={t("roles.removeMember")}
                      >
                        {deleting === member.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </Button>
                    )}
                  </>
                )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pending Invitations */}
      {canManageTeam && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("roles.pendingInvitations")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center gap-3 p-3 border border-border rounded-lg"
              >
                <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{invitation.email}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {t(
                      `roles.roleTemplates.${invitation.role}`,
                      invitation.role
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {getStatusIcon(invitation.status)}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleResendInvitation(invitation.id)}
                    disabled={resending === invitation.id}
                    title={t("roles.resendInvitationEmail")}
                  >
                    {resending === invitation.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      openEditDialog({ type: "invitation", data: invitation })
                    }
                    title={t("roles.editInvitationPermissions")}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleCancelInvitation(invitation.id)}
                    title={t("roles.cancelInvitationTitle")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Workers Section */}
      {canManageTeam && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">{t("teamWorker.workers", "Workers")}</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setWorkerDialogOpen(true)}>
              <Wrench className="h-3.5 w-3.5 mr-1.5" />
              {t("teamWorker.inviteWorker", "Invite Worker")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {workerTokens.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                {t("teamWorker.noWorkers", "No workers invited yet.")}
              </p>
            ) : (
              workerTokens.map((wt) => {
                const isExpired = new Date(wt.expires_at) < new Date();
                const isRevoked = !!wt.revoked_at;
                const isActive = !isExpired && !isRevoked;
                const langFlag = LANG_FLAGS[wt.worker_language] || "";
                const isExpanded = expandedWorkerId === wt.id;
                const taskNames = (wt.assigned_task_ids || []).map((id) => workerTaskNames[id] || id);

                return (
                  <div
                    key={wt.id}
                    className={`border rounded-lg transition-colors ${!isActive ? "opacity-60" : ""}`}
                  >
                    {/* Main row — clickable to expand */}
                    <button
                      type="button"
                      className="flex items-center gap-3 p-3 w-full text-left hover:bg-muted/50 transition-colors rounded-lg"
                      onClick={() => setExpandedWorkerId(isExpanded ? null : wt.id)}
                    >
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm">
                        {langFlag}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{wt.worker_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {taskNames.length > 0
                            ? taskNames.slice(0, 2).join(", ") + (taskNames.length > 2 ? ` +${taskNames.length - 2}` : "")
                            : t("teamWorker.tasksAssigned", "{{count}} tasks", { count: 0 })}
                          {wt.worker_phone && <> · {wt.worker_phone}</>}
                          {wt.worker_email && <> · {wt.worker_email}</>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isActive ? (
                          <span className="text-xs text-emerald-600 font-medium">{t("teamWorker.active", "Active")}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{isRevoked ? t("teamWorker.revoked", "Revoked") : t("teamWorker.expired", "Expired")}</span>
                        )}
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Expanded detail panel */}
                    {isExpanded && (
                      <div className="border-t px-4 py-3 space-y-3 bg-muted/30">
                        {/* Contact info */}
                        {(wt.worker_phone || wt.worker_email) && (
                          <div className="flex flex-wrap gap-4 text-sm">
                            {wt.worker_phone && (
                              <a href={`tel:${wt.worker_phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                                <Phone className="h-3.5 w-3.5" />
                                {wt.worker_phone}
                              </a>
                            )}
                            {wt.worker_email && (
                              <a href={`mailto:${wt.worker_email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                                <Mail className="h-3.5 w-3.5" />
                                {wt.worker_email}
                              </a>
                            )}
                          </div>
                        )}

                        {/* Assigned tasks */}
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">
                            {t("teamWorker.assignedTasksList", "Assigned tasks")}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {taskNames.map((name, i) => (
                              <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md bg-background border text-xs">
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Last accessed */}
                        {wt.last_accessed_at && (
                          <p className="text-xs text-muted-foreground">
                            {t("teamWorker.lastAccessed", "Last accessed")}: {new Date(wt.last_accessed_at).toLocaleDateString("sv-SE")}
                          </p>
                        )}

                        {/* Actions */}
                        {isActive && (
                          <div className="flex items-center gap-2 pt-1">
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={(e) => { e.stopPropagation(); handleCopyWorkerLink(wt.token); }}>
                              <ClipboardList className="h-3.5 w-3.5" />
                              {t("teamWorker.copyLink", "Copy link")}
                            </Button>
                            <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleRevokeWorker(wt.id); }}>
                              <X className="h-3.5 w-3.5" />
                              {t("teamWorker.revokeAccess", "Revoke access")}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {/* ROT Persons — owner-only, lowest priority */}
      {isOwner && showTaxDeduction && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-600" />
              {t("roles.rotPersons")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("roles.rotPersonsDescription")}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {rotPersons.map((person) => (
              <div key={person.id} className="flex items-center gap-3 p-2.5 border rounded-lg">
                <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center text-xs font-medium text-green-700 shrink-0">
                  {person.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{person.name}</p>
                  {person.personnummerLast4 && (
                    <p className="text-xs text-muted-foreground">****-{person.personnummerLast4}</p>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0 text-green-700 border-green-200">
                  ROT
                </Badge>
                <button
                  type="button"
                  onClick={async () => {
                    const { error } = await supabase.from("project_rot_persons").delete().eq("id", person.id);
                    if (error) console.error("Error removing ROT person:", error);
                    fetchTeamData();
                  }}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title={t("common.remove")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <RotPersonAddForm projectId={projectId} onAdded={fetchTeamData} t={t} />
          </CardContent>
        </Card>
      )}

      {/* Invite Worker Dialog */}
      <InviteWorkerDialog
        projectId={projectId}
        open={workerDialogOpen}
        onOpenChange={setWorkerDialogOpen}
        onCreated={fetchTeamData}
      />

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
              />
            </div>

            {/* Permissions — compact dropdown-per-feature list */}
            <Collapsible defaultOpen={selectedTemplate === "custom"}>
              <CollapsibleTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-90" />
                {t("roles.permissions", "Permissions")}
              </CollapsibleTrigger>
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
              <Button onClick={() => setDialogOpen(true)}>
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
}

function RoleCardGrid({ selected, onSelect, t }: RoleCardGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.keys(ROLE_TEMPLATES).map((key) => {
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
              {t(`roles.cards.${key}.description`)}
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
