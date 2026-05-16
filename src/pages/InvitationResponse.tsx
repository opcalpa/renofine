import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, Home, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { cloneRfqForBuilder } from "@/lib/rfqClone";

interface PermissionsSnapshot {
  role_type?: string;
  /** v2: ISO timestamp the share auto-expires at, or null = permanent. */
  expires_at?: string | null;
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

interface InvitationDetails {
  id: string;
  email: string;
  role: string;
  role_type?: string | null;
  status: string;
  project: {
    id: string;
    name: string;
  };
  inviter?: {
    name: string | null;
    email: string;
  } | null;
  related_quote_id?: string | null;
  related_invoice_id?: string | null;
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
  permissions_snapshot?: PermissionsSnapshot | null;
}

const getAccessAbilities = (inv: InvitationDetails, t: (key: string, fallback?: string) => string): string[] => {
  const abilities: string[] = [];
  if (inv.overview_access && inv.overview_access !== "none")
    abilities.push(t("invitation.abilities.viewProgress", "View project progress"));
  if (inv.files_access && inv.files_access !== "none")
    abilities.push(t("invitation.abilities.viewPhotos", "See photos and documents"));
  if (inv.tasks_access === "edit")
    abilities.push(t("invitation.abilities.manageTasks", "Create and manage tasks"));
  else if (inv.tasks_access && inv.tasks_access !== "none")
    abilities.push(t("invitation.abilities.viewTasks", "Follow tasks and progress"));
  if (inv.budget_access && inv.budget_access !== "none")
    abilities.push(t("invitation.abilities.viewBudget", "View budget overview"));
  if (inv.purchases_access && inv.purchases_access !== "none" && inv.purchases_access !== "view")
    abilities.push(t("invitation.abilities.reportMaterials", "Report materials"));
  abilities.push(t("invitation.abilities.comment", "Comment and communicate"));
  return abilities;
};

const InvitationResponse = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid invitation link");
      setLoading(false);
      return;
    }

    fetchInvitation();
  }, [token]);

  const fetchInvitation = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("project_invitations")
        .select(`
          id,
          email,
          role,
          role_type,
          status,
          project_id,
          related_quote_id,
          related_invoice_id,
          timeline_access,
          tasks_access,
          tasks_scope,
          space_planner_access,
          purchases_access,
          purchases_scope,
          overview_access,
          teams_access,
          budget_access,
          files_access,
          permissions_snapshot,
          invited_by_user_id,
          invited_name,
          project:projects(id, name),
          inviter:profiles!invited_by_user_id(name, email)
        `)
        .eq("token", token)
        .single();

      if (fetchError || !data) {
        setError("Invitation not found or expired");
        return;
      }

      // If project join failed (RLS blocks unauthenticated reads), use project_id as fallback
      if (!data.project) {
        (data as any).project = { id: data.project_id, name: "Project" };
      }

      if (data.status === "accepted") {
        setError("This invitation has already been accepted");
        return;
      }

      if (data.status === "rejected") {
        setError("This invitation has been declined");
        return;
      }

      setInvitation(data as any);
    } catch (err: unknown) {
      console.error("Error fetching invitation:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!invitation) return;

    setAccepting(true);
    try {
      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        // Redirect to auth with return URL
        navigate(`/auth?redirect=/invitation?token=${token}`);
        return;
      }

      // Get user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, email")
        .eq("user_id", user.id)
        .single();

      if (!profile) {
        throw new Error("Profile not found");
      }

      // Verify email matches (normalize Gmail +alias addresses)
      const normalizeEmail = (email: string) =>
        email.toLowerCase().replace(/(\+[^@]*)@/, "@");
      if (normalizeEmail(profile.email) !== normalizeEmail(invitation.email)) {
        throw new Error(`This invitation was sent to ${invitation.email}. Please log in with that email.`);
      }

      // Fetch contractor_role from invitation (requires auth, so done here)
      let contractorRole: string | null = null;
      const { data: invData, error: invError } = await supabase
        .from("project_invitations")
        .select("contractor_role")
        .eq("id", invitation.id)
        .single();

      if (!invError && invData?.contractor_role) {
        contractorRole = invData.contractor_role;
      }

      const isContractor = contractorRole && contractorRole !== 'other';

      // Use permissions_snapshot if available, fallback to individual columns
      const perms = invitation.permissions_snapshot || {};

      // Detect special invitation types
      const isRfqBuilder = perms.role_type === "rfq_builder" || invitation.role_type === "rfq_builder";
      const isPlanningContributor = perms.role_type === "planning_contributor" || invitation.role_type === "planning_contributor";
      const isCoOwner = perms.role_type === "co_owner" || invitation.role_type === "co_owner";
      // v2 personas
      const isPmHired = perms.role_type === "pm_hired" || invitation.role_type === "pm_hired";
      const isMember = perms.role_type === "member" || invitation.role_type === "member";
      const roleType = isRfqBuilder
        ? "rfq_builder"
        : isPlanningContributor
          ? "planning_contributor"
          : isCoOwner
            ? "co_owner"
            : isPmHired
              ? "pm_hired"
              : invitation.role === "client"
                ? "client"
                : isMember
                  ? "member"
                  : (isContractor ? 'contractor' : 'other');
      const contractorCategory = isContractor ? contractorRole : null;

      const isClientInvite = invitation.role === "client";

      // Co-owners get full edit access on all features
      const coOwnerAccess = isCoOwner ? 'edit' : null;
      // Map template role names to DB-allowed values (viewer/editor/admin/client)
      const dbRoleMap: Record<string, string> = {
        contractor: "editor",
        project_manager: "admin",
        collaborator: "viewer",
        client: "client",
        homeowner: "editor",
        // Legacy
        architect: "viewer",
        viewer: "viewer",
        editor: "editor",
        admin: "admin",
      };
      const dbRole = dbRoleMap[invitation.role || ""] || "viewer";

      const sharePayload = {
        role: isCoOwner || isPmHired ? "admin" : dbRole,
        role_type: roleType,
        // v2: time-bounded shares (PM/specialist). Snapshot-carried; legacy
        // invites have no expires_at → null = permanent (unchanged behaviour).
        expires_at: perms.expires_at ?? null,
        contractor_role: contractorCategory,
        timeline_access: coOwnerAccess || perms.timeline_access || invitation.timeline_access || 'view',
        tasks_access: coOwnerAccess || (isClientInvite ? (perms.tasks_access || 'none') : (perms.tasks_access || invitation.tasks_access || 'view')),
        tasks_scope: isCoOwner ? 'all' : (perms.tasks_scope || invitation.tasks_scope || 'assigned'),
        space_planner_access: coOwnerAccess || (isClientInvite ? (perms.space_planner_access || 'none') : (perms.space_planner_access || invitation.space_planner_access || 'view')),
        purchases_access: coOwnerAccess || (isClientInvite ? (perms.purchases_access || 'none') : (perms.purchases_access || invitation.purchases_access || 'view')),
        purchases_scope: isCoOwner ? 'all' : (perms.purchases_scope || invitation.purchases_scope || 'assigned'),
        overview_access: coOwnerAccess || (isClientInvite ? (perms.overview_access || 'none') : (perms.overview_access || invitation.overview_access || 'view')),
        teams_access: coOwnerAccess || perms.teams_access || invitation.teams_access || 'none',
        budget_access: coOwnerAccess || perms.budget_access || invitation.budget_access || (isClientInvite ? 'view' : 'none'),
        files_access: coOwnerAccess || perms.files_access || invitation.files_access || 'none',
        customer_view_access: coOwnerAccess || (isClientInvite ? 'view' : 'none'),
      };

      // RFQ builders: skip share on homeowner's project — they only get the clone
      if (!isRfqBuilder) {
        const { data: existingShare } = await supabase
          .from("project_shares")
          .select("id")
          .eq("project_id", invitation.project.id)
          .eq("shared_with_user_id", profile.id)
          .maybeSingle();

        const { error: shareError } = existingShare
          ? await supabase
              .from("project_shares")
              .update(sharePayload)
              .eq("id", existingShare.id)
          : await supabase
              .from("project_shares")
              .insert({
                project_id: invitation.project.id,
                shared_with_user_id: profile.id,
                ...sharePayload,
              });

        if (shareError) throw shareError;
      }

      // Update invitation status
      const { error: updateError } = await supabase
        .from("project_invitations")
        .update({ status: "accepted" })
        .eq("id", invitation.id);

      if (updateError) throw updateError;

      // Flag profile onboarding — skip WelcomeModal
      if (!isRfqBuilder) {
        await supabase
          .from("profiles")
          .update({
            onboarding_welcome_completed: true,
            onboarding_user_type: isCoOwner ? "homeowner" : (isPlanningContributor ? "homeowner" : "invited_client"),
          })
          .eq("id", profile.id);
      }

      // Co-owner: auto-add as ROT person if they have personnummer
      if (isCoOwner) {
        const { data: coOwnerProfile } = await supabase
          .from("profiles")
          .select("name, personnummer")
          .eq("id", profile.id)
          .single();

        if (coOwnerProfile?.name) {
          await supabase.from("project_rot_persons").insert({
            project_id: invitation.project.id,
            name: coOwnerProfile.name,
            personnummer: coOwnerProfile.personnummer || null,
            profile_id: profile.id,
          });
        }
      }

      setAccepted(true);

      // RFQ builder: clone homeowner's project into builder's own workspace
      let redirectTarget: string;
      if (isRfqBuilder) {
        try {
          const cloneResult = await cloneRfqForBuilder(invitation.project.id, profile.id);
          toast({
            title: t("invitation.rfqAccepted", "Quote request received!"),
            description: t("invitation.rfqAcceptedDescription", "The homeowner's scope has been copied to your workspace. Add your pricing and create a quote."),
          });
          redirectTarget = `/projects/${cloneResult.projectId}?welcome=rfq`;
        } catch (cloneErr) {
          console.error("RFQ clone failed:", cloneErr);
          toast({
            title: t("invitation.accepted", "Invitation accepted!"),
            description: t("invitation.acceptedDescription", "You now have access to the project."),
          });
          redirectTarget = `/projects/${invitation.project.id}?welcome=invited`;
        }
      } else {
        toast({
          title: t("invitation.accepted", "Invitation accepted!"),
          description: t("invitation.acceptedDescription", "You now have access to the project."),
        });
        redirectTarget = invitation.related_quote_id
          ? `/quotes/${invitation.related_quote_id}?returnTo=/projects/${invitation.project.id}`
          : invitation.related_invoice_id
            ? `/invoices/${invitation.related_invoice_id}?returnTo=/projects/${invitation.project.id}`
            : `/projects/${invitation.project.id}?welcome=invited`;
      }

      setTimeout(() => {
        navigate(redirectTarget);
      }, 2000);
    } catch (err: unknown) {
      console.error("Error accepting invitation:", err);
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    if (!invitation) return;

    try {
      const { error } = await supabase
        .from("project_invitations")
        .update({ status: "rejected" })
        .eq("id", invitation.id);

      if (error) throw error;

      toast({
        title: "Invitation declined",
        description: "You have declined the invitation.",
      });

      navigate("/");
    } catch (err: unknown) {
      console.error("Error declining invitation:", err);
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 flex flex-col items-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <XCircle className="h-6 w-6 text-destructive" />
              <CardTitle>Invitation Error</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={() => navigate("/")} variant="outline" className="w-full">
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-success" />
              <CardTitle>Invitation Accepted!</CardTitle>
            </div>
            <CardDescription>Redirecting to project...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!invitation) return null;

  const permsForDisplay = invitation.permissions_snapshot || {};
  const isRfqInvite = permsForDisplay.role_type === "rfq_builder";
  const isPlanningInvite = permsForDisplay.role_type === "planning_contributor";
  const abilities = getAccessAbilities(invitation, t);

  const rfqAbilities = [
    t("invitation.rfqAbilities.viewScope", "View the homeowner's scope of work and rooms"),
    t("invitation.rfqAbilities.createQuote", "Create your quote based on their requirements"),
    t("invitation.rfqAbilities.communicate", "Communicate and ask questions"),
  ];

  const planningAbilities = [
    t("invitation.planningAbilities.addTasks", "Add and describe what work needs to be done"),
    t("invitation.planningAbilities.addRooms", "Add rooms with dimensions"),
    t("invitation.planningAbilities.linkRooms", "Connect tasks to rooms"),
    t("invitation.planningAbilities.communicate", "Comment and communicate"),
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {isRfqInvite
              ? t("invitation.rfqTitle", "Quote request")
              : isPlanningInvite
                ? t("invitation.planningTitle", "Help plan a renovation")
                : t("invitation.youreInvited", "You're invited!")}
          </CardTitle>
          <CardDescription>
            {isRfqInvite
              ? t("invitation.rfqDescription", "A homeowner wants a quote for their renovation project")
              : isPlanningInvite
                ? t("invitation.planningDescription", "You've been invited to describe what work needs to be done")
                : t("invitation.invitedToProject", "You've been invited to follow a renovation project")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold">{invitation.project?.name || "Project"}</h3>
            {invitation.inviter && (
              <p className="text-sm text-muted-foreground mt-1">
                {t("invitation.from", "From")} {invitation.inviter.name || invitation.inviter.email}
              </p>
            )}
          </div>

          <div className="bg-muted/50 p-4 rounded-lg space-y-3">
            <p className="text-sm text-muted-foreground">
              {isRfqInvite
                ? t("invitation.rfqYouCan", "When you accept, you'll be able to:")
                : isPlanningInvite
                  ? t("invitation.planningYouCan", "You'll be able to:")
                  : t("invitation.youCan", "In this project you can:")}
            </p>
            <ul className="space-y-2">
              {(isRfqInvite ? rfqAbilities : isPlanningInvite ? planningAbilities : abilities).map((ability, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500 shrink-0" />
                  {ability}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleAccept}
              disabled={accepting}
              className="flex-1"
              size="lg"
            >
              {accepting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isRfqInvite
                    ? t("invitation.rfqAccepting", "Setting up workspace...")
                    : t("invitation.accepting", "Accepting...")}
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {isRfqInvite
                    ? t("invitation.rfqAccept", "View & create quote")
                    : isPlanningInvite
                      ? t("invitation.planningAccept", "Start planning")
                      : t("invitation.accept", "Accept Invitation")}
                </>
              )}
            </Button>
            <Button
              onClick={handleDecline}
              variant="outline"
              size="lg"
              disabled={accepting}
            >
              {t("invitation.decline", "Decline")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InvitationResponse;
