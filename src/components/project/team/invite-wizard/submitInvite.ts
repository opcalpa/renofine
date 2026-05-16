import { supabase } from "@/integrations/supabase/client";
import type { FeatureAccess } from "../FeatureAccessEditor";
import type { InstructionImage, InviteWizardState } from "./types";
import { personaToAccess } from "./personaToAccess";

/**
 * Normalize a phone number to E.164-ish form so storage and duplicate
 * detection are consistent. Swedish-first: a bare or 0-prefixed number is
 * assumed Swedish (+46). Explicit international input (leading + or 00) is
 * preserved. Non-numeric junk is returned trimmed rather than mangled.
 */
export function normalizeSwedishPhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const cleaned = trimmed.replace(/[\s\-().]/g, "");
  if (!/\d/.test(cleaned)) return trimmed;

  if (cleaned.startsWith("+")) {
    return "+" + cleaned.slice(1).replace(/\D/g, "");
  }
  const digits = cleaned.replace(/\D/g, "");
  if (digits.startsWith("00")) {
    return "+" + digits.slice(2);
  }
  if (digits.startsWith("0")) {
    return "+46" + digits.slice(1);
  }
  if (digits.startsWith("46")) {
    return "+" + digits;
  }
  return "+46" + digits;
}

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
  /** Revoked worker token being re-invited — deleted once the new one is live. */
  replacesWorkerTokenId?: string;
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
  if (state.persona === "worker") {
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

  // V2: access is derived deterministically from persona + mode + scope.
  const permDb = accessToDb(
    personaToAccess(state.persona, state.mode, state.scope, state.pmSubType),
  );

  // Map profession to contractor_role enum compatibility.
  // The enum only knows utförar-yrken; for customer/auditor/agent/broker we
  // store "other" until the enum is extended in a future migration.
  const contractorEnum = mapProfessionToContractorEnum(state.profession);

  const role = roleForPersona(state);
  const roleType = roleTypeForPersona(state);

  const { data: invitationData, error } = await supabase
    .from("project_invitations")
    .insert({
      project_id: ctx.projectId,
      invited_by_user_id: profile.id,
      invited_email: state.contact.email.trim(),
      invited_name: state.contact.name.trim() || null,
      contractor_role: contractorEnum,
      role,
      role_type: roleType,
      // expires_at lands on project_shares at acceptance time — carried in
      // the snapshot so the accept-invitation path can apply it.
      permissions_snapshot: {
        ...permDb,
        role_type: roleType,
        expires_at: state.expiresAt,
      },
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
  const normalizedPhone = normalizeSwedishPhone(state.contact.phone);

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
  // Normalize the existing set too — legacy rows may have been stored
  // before normalization, so compare apples to apples.
  const existingPhones = new Set(
    Array.from(ctx.existingWorkerContacts.phones).map(normalizeSwedishPhone),
  );
  if (normalizedPhone && existingPhones.has(normalizedPhone)) {
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

  // Persist instruction overrides for any task the owner customized.
  const overrides = Array.from(state.workerAccess.taskOverrides.values()).filter(
    (o) =>
      o.descriptionOverride !== null ||
      o.checklistOverride !== null ||
      o.photoOverride !== null,
  );
  if (overrides.length > 0) {
    await supabase.from("worker_instruction_overrides").insert(
      overrides.map((o) => ({
        worker_token_id: tokenRecord.id,
        task_id: o.taskId,
        description_override: o.descriptionOverride,
        checklist_override: o.checklistOverride,
        photo_override: o.photoOverride,
      })),
    );
  }

  // Persist per-task instruction images (upload new files first, then insert rows).
  await persistInstructionImages(
    state.workerAccess.instructionImages,
    tokenRecord.id,
    ctx.projectId,
  );

  // Re-invite: the new token is fully live, so drop the revoked one it
  // replaces. Child rows cascade (ON DELETE CASCADE). Best-effort — a
  // failure here only leaves a harmless duplicate in the Inactive list.
  if (ctx.replacesWorkerTokenId) {
    const { error: delError } = await supabase
      .from("worker_access_tokens")
      .delete()
      .eq("id", ctx.replacesWorkerTokenId);
    if (delError) {
      console.error("Failed to remove replaced worker token:", delError);
    }
  }

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

async function persistInstructionImages(
  imageMap: Map<string, InstructionImage[]>,
  tokenId: string,
  projectId: string,
): Promise<void> {
  type Row = {
    worker_token_id: string;
    task_id: string;
    photo_id: string | null;
    uploaded_url: string | null;
    description: string;
    sort_order: number;
  };
  const rows: Row[] = [];

  for (const [taskId, images] of imageMap.entries()) {
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      let uploadedUrl: string | null = img.uploadedUrl ?? null;

      if (img.source === "upload" && img.file && !uploadedUrl) {
        const ext = img.file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `projects/${projectId}/worker-instructions/${tokenId}/${img.localId}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("project-files")
          .upload(path, img.file, { upsert: true });
        if (uploadErr) {
          console.error("Failed to upload instruction image:", uploadErr);
          continue;
        }
        const { data: urlData } = supabase.storage
          .from("project-files")
          .getPublicUrl(path);
        uploadedUrl = urlData.publicUrl;
      }

      rows.push({
        worker_token_id: tokenId,
        task_id: taskId,
        photo_id: img.source === "existing" ? img.photoId ?? null : null,
        uploaded_url: img.source === "upload" ? uploadedUrl : null,
        description: img.description.trim(),
        sort_order: i,
      });
    }
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("worker_invite_instruction_images" as never)
    .insert(rows as never);

  if (error) {
    console.error("Failed to insert instruction images:", error);
  }
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

/** Legacy `role` column — kept for backward compat with detectTemplate(). */
function roleForPersona(state: InviteWizardState): string {
  switch (state.persona) {
    case "client":
      // "client" so the accept-invitation path's isClientInvite branch fires.
      return "client";
    case "pm":
      return "projectManager";
    default:
      return "contractor";
  }
}

/** V2 `role_type` — the canonical persona signal (used by detectPersonaMode). */
function roleTypeForPersona(state: InviteWizardState): string {
  if (state.persona === "client") return "client";
  if (state.persona === "pm") {
    return state.pmSubType === "pm_hired" ? "pm_hired" : "co_owner";
  }
  return "member";
}
