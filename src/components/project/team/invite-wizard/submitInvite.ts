import { supabase } from "@/integrations/supabase/client";
import type { FeatureAccess } from "../FeatureAccessEditor";
import type { InviteWizardState } from "./types";

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

export interface MemberSubmitResult {
  kind: "member";
  invitationId: string;
  emailSendFailed: boolean;
}

export interface WorkerSubmitResult {
  kind: "worker";
  tokenId: string;
  workerLink: string;
}

export type SubmitResult = MemberSubmitResult | WorkerSubmitResult;

export interface SubmitContext {
  projectId: string;
  /** Existing member emails (lowercased) for dup-check */
  existingMemberEmails: Set<string>;
  /** Existing pending invitation emails (lowercased) for dup-check */
  existingInvitationEmails: Set<string>;
  /** Active worker emails+phones for dup-check */
  existingWorkerContacts: { emails: Set<string>; phones: Set<string> };
}

export class DuplicateContactError extends Error {
  kind: "active_member" | "pending_invitation" | "active_worker";
  constructor(kind: DuplicateContactError["kind"], message: string) {
    super(message);
    this.kind = kind;
    this.name = "DuplicateContactError";
  }
}

export async function submitInvite(
  state: InviteWizardState,
  ctx: SubmitContext,
): Promise<SubmitResult> {
  if (state.path === "worker") {
    return submitWorker(state, ctx);
  }
  return submitMember(state, ctx);
}

async function submitMember(
  state: InviteWizardState,
  ctx: SubmitContext,
): Promise<MemberSubmitResult> {
  const normalizedEmail = state.contact.email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Email is required for member invites");
  }
  if (ctx.existingMemberEmails.has(normalizedEmail)) {
    throw new DuplicateContactError(
      "active_member",
      "E-postadressen är redan en aktiv medlem.",
    );
  }
  if (ctx.existingInvitationEmails.has(normalizedEmail)) {
    throw new DuplicateContactError(
      "pending_invitation",
      "E-postadressen har redan en väntande inbjudan.",
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) throw new Error("Profile not found");

  const permDb = accessToDb(state.memberAccess.access);

  // Map profession to contractor_role enum compatibility.
  // The enum only knows utförar-yrken; for customer/auditor/agent/broker we
  // store "other" until the enum is extended in a future migration.
  const contractorEnum = mapProfessionToContractorEnum(state.profession);

  const role = roleForMember(state);

  const { data: invitationData, error } = await supabase
    .from("project_invitations")
    .insert({
      project_id: ctx.projectId,
      invited_by_user_id: profile.id,
      invited_email: state.contact.email.trim(),
      invited_name: state.contact.name.trim() || null,
      contractor_role: contractorEnum,
      role,
      role_type: null,
      permissions_snapshot: { ...permDb, role_type: null },
      ...permDb,
    } as Record<string, unknown>)
    .select("id")
    .single();

  if (error) throw error;

  let emailSendFailed = false;
  try {
    const { error: sendError } = await supabase.functions.invoke(
      "send-project-invitation",
      { body: { invitationId: invitationData.id } },
    );
    if (sendError) {
      console.error("send-project-invitation error:", sendError);
      emailSendFailed = true;
    }
  } catch (sendErr) {
    console.error("send-project-invitation threw:", sendErr);
    emailSendFailed = true;
  }

  return {
    kind: "member",
    invitationId: invitationData.id,
    emailSendFailed,
  };
}

async function submitWorker(
  state: InviteWizardState,
  ctx: SubmitContext,
): Promise<WorkerSubmitResult> {
  const normalizedEmail = state.contact.email.trim().toLowerCase();
  const normalizedPhone = state.contact.phone.trim();

  if (!normalizedEmail && !normalizedPhone) {
    throw new Error("Worker needs an email or phone number");
  }
  if (state.workerAccess.taskIds.length === 0) {
    throw new Error("Worker needs at least one assigned task");
  }

  if (normalizedEmail && ctx.existingWorkerContacts.emails.has(normalizedEmail)) {
    throw new DuplicateContactError(
      "active_worker",
      "En arbetare med denna e-post har redan en aktiv länk.",
    );
  }
  if (normalizedPhone && ctx.existingWorkerContacts.phones.has(normalizedPhone)) {
    throw new DuplicateContactError(
      "active_worker",
      "En arbetare med detta telefonnummer har redan en aktiv länk.",
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) throw new Error("Profile not found");

  const { data: tokenRecord, error } = await supabase
    .from("worker_access_tokens")
    .insert({
      project_id: ctx.projectId,
      created_by_user_id: profile.id,
      worker_name: state.contact.name.trim(),
      worker_phone: normalizedPhone || null,
      worker_email: state.contact.email.trim() || null,
      worker_language: state.contact.language || "sv",
      welcome_message: state.contact.welcomeMessage?.trim() || null,
      assigned_task_ids: state.workerAccess.taskIds,
      can_create_purchases: state.workerAccess.canProposePurchases,
      can_log_receipts: state.workerAccess.canLogPurchases,
    })
    .select("id, token")
    .single();

  if (error) throw error;

  const language = state.contact.language || "sv";
  if (language !== "en" && language !== "sv") {
    supabase.functions
      .invoke("translate-task-content", {
        body: {
          taskIds: state.workerAccess.taskIds,
          targetLanguage: language,
        },
      })
      .catch(() => {});
  }

  const appOrigin =
    window.location.hostname === "localhost"
      ? "https://app.renofine.com"
      : window.location.origin;

  return {
    kind: "worker",
    tokenId: tokenRecord.id,
    workerLink: `${appOrigin}/w/${tokenRecord.token}`,
  };
}

function mapProfessionToContractorEnum(profession: string | null): string {
  if (!profession) return "other";
  // Enum-supported keys
  const supported = new Set([
    "carpenter",
    "electrician",
    "plumber",
    "painter",
    "designer",
    "architect",
    "general_contractor",
    "supplier",
    "other",
  ]);
  if (supported.has(profession)) return profession;
  // Extended professions (tiler/hvac/customer/auditor/agent/broker) → "other"
  // until the enum is extended in a follow-up migration.
  return "other";
}

function roleForMember(state: InviteWizardState): string {
  // Map profession to a role string compatible with TeamManagement's existing
  // detectTemplate() logic: contractor / projectManager / customer / collaborator.
  // For the new flat profession list we route everyone to "contractor" unless
  // they're clearly a manager or customer-facing role. This keeps the DB schema
  // happy without forcing a separate role-type field decision into this PR.
  const profession = state.profession;
  if (profession === "general_contractor") return "projectManager";
  if (profession === "customer") return "customer";
  if (profession === "auditor" || profession === "agent" || profession === "broker") {
    return "collaborator";
  }
  return "contractor";
}
