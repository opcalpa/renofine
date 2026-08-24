/**
 * Agentic layer — shared proposal envelope.
 *
 * The single contract every capture modality (voice, receipt, quote, free text)
 * normalizes into. The `agent-route` edge function PROPOSES these; nothing is
 * applied server-side. `applyProposals` maps each accepted proposal to an
 * existing DB write path. See .claude/briefs/agentic-mvp.md.
 */

/** Fields a proposal may update on an existing task. Kept minimal on purpose. */
export interface TaskWritableFields {
  title: string;
  description: string;
  status: string;
  progress: number;
  /** YYYY-MM-DD — the router resolves relative dates ("på fredag") server-side. null clears. */
  due_date: string | null;
  start_date: string | null;
  budget: number | null;
  priority: string;
}

export type ProposalAction =
  | { type: "update_task"; taskId: string; changes: Partial<TaskWritableFields> }
  | { type: "set_progress"; taskId: string; progress: number; status?: string }
  /** Scaffold a room the user named but that doesn't exist yet (empty-project flow). */
  | {
      type: "create_room";
      name: string;
      /**
       * Import review: an existing room this one probably IS (`WC` next to
       * `Gäst WC`). Only ever a pre-filled suggestion — set by roomMatch when
       * it is close but not certain, and confirmed by the person.
       */
      suggestedMergeRoomId?: string;
      /**
       * Set when the person chose to merge: apply writes nothing and reports
       * this id, so the batch's tasks land on the room that already exists.
       */
      mergeIntoRoomId?: string;
    }
  /**
   * roomName: the room the task belongs to when it does NOT exist yet — resolved
   * at apply time against rooms created earlier in the same batch (create_room
   * proposals are applied first). roomId wins when both are set.
   */
  | { type: "create_task"; roomId?: string; roomName?: string; title: string; description?: string }
  | { type: "create_purchase"; roomId?: string; item: string; quantity?: number; unit?: string }
  | { type: "log_time"; taskId?: string; hours: number; date?: string; description?: string }
  | { type: "toggle_checklist"; taskId: string; itemText: string; completed?: boolean }
  /** Author checklist moments on a task (appends to a single existing list, else creates one). */
  | { type: "create_checklist"; taskId: string; title?: string; items: string[] }
  | { type: "remove_checklist_item"; taskId: string; itemText: string }
  /**
   * Assign a task to a project member (tasks.assigned_to_stakeholder_id = profile id).
   * assigneeName is resolved server-side from the member list — display only.
   * The router's normalize step guarantees assigneeProfileId is a real member.
   */
  | { type: "assign_task"; taskId: string; assigneeProfileId: string; assigneeName?: string }
  | { type: "add_note"; target: "task" | "room" | "project"; targetId: string; text: string }
  /**
   * Feature guidance ("vägvisare", Carl 2026-07-12): opens the right screen for
   * something Renaida shouldn't fill inline — contractor quote/invoice/ÄTA
   * creation. Applying it NAVIGATES; it writes no data and has no undo.
   */
  | { type: "open_feature"; feature: "new_quote" | "new_invoice" | "new_ata"; label: string }
  /**
   * E3: update the builder's default rates — profiles IS the source of truth
   * for satser (default_hourly_rate + markups), so "mitt timpris är 640" lands
   * there, confirmed via ConfirmDiff like everything else. Contractor-only.
   */
  | { type: "set_default_rate"; field: "hourly_rate" | "markup_percent" | "material_markup_percent"; value: number }
  /**
   * AI-scanned receipt/invoice → one purchase order + its material line items
   * (the PO invariant: every scanned document lives in Inköp as a first-class
   * order). Built CLIENT-SIDE from process-document-v2 output — the router
   * never emits this. The image file travels via the in-memory attachment
   * registry (documentCapture.ts), keyed by attachmentKey, because File
   * objects don't belong in a serializable action.
   */
  | {
      type: "import_purchase";
      documentType: "receipt" | "invoice";
      vendorName: string;
      total: number;
      vatAmount?: number | null;
      /** YYYY-MM-DD — purchase/delivery date from the document. */
      documentDate?: string | null;
      dueDate?: string | null;
      invoiceNumber?: string | null;
      ocrNumber?: string | null;
      rotAmount?: number | null;
      /**
       * renaida-material-receipt-match: a line matched to a PLANNED material
       * carries that material's id (source_material_id → consumes its budget)
       * plus the task/room it inherits. Populated by matchPlannedMaterials at
       * capture time; the user confirms/rejects each in ConfirmDiff.
       */
      lineItems: {
        description: string;
        quantity: number;
        unitPrice: number | null;
        total: number | null;
        sourceMaterialId?: string | null;
        sourceMaterialName?: string | null;
        taskId?: string | null;
        roomId?: string | null;
        /** 0..1 match confidence — drives strong (pre-accepted) vs weak (opt-in). */
        matchScore?: number | null;
      }[];
      attachmentKey?: string;
      /** D3: room attribution from the user's words at capture time
       *  ("här är kvittot, lägg det på badrummet") — allocates the order's lines. */
      roomId?: string | null;
      roomName?: string | null;
      /** For the single bulk fallback row (no line items) — matched planned material. */
      sourceMaterialId?: string | null;
      sourceMaterialName?: string | null;
      taskId?: string | null;
      matchScore?: number | null;
      /** Book UNMATCHED lines as ÄTA/extra (exclude_from_budget=true) instead of
       *  a normal material-budget line. Off by default; user opt-in in ConfirmDiff. */
      bookAsAta?: boolean;
    }
  /**
   * Skiva 4: an analyzed floor plan → a new plan in the Space Planner with the
   * detected walls/rooms/doors drawn in. Built CLIENT-SIDE from the folder
   * ingest (the router never emits it). The analysis result travels via the
   * in-memory sketch registry keyed by sketchKey — like import_purchase's
   * attachment, geometry blobs don't belong in a serializable action.
   */
  | { type: "create_plan_sketch"; planName: string; sketchKey: string; roomCount: number; wallCount: number }
  /** Router could not confidently route the input — surface as a question, never apply. */
  | { type: "unknown"; rawText: string; reason: string };

export type ProposalType = ProposalAction["type"];

/** A task the user could re-target a proposal onto (for manual pick in ConfirmDiff). */
export interface TaskCandidate {
  id: string;
  title: string;
}

export interface AgentProposal {
  /** Client-stable id for diff tracking / selection in ConfirmDiff. */
  id: string;
  /** Human one-liner in the user's language, e.g. "Markera Köket som målat (90%)". */
  summary: string;
  /** 0..1 — drives default selection in ConfirmDiff (>= 0.5 pre-checked). */
  confidence: number;
  action: ProposalAction;
  /**
   * For task-targeting actions (update_task / set_progress): how sure the router
   * is that it picked the RIGHT task. Below TASK_MATCH_MIN_CONFIDENCE the proposal
   * is shown unchecked so the user must confirm or re-pick — never silently applied.
   */
  matchConfidence?: number;
  /** Alternative tasks for manual re-pick when the match is uncertain. */
  candidates?: TaskCandidate[];
  /**
   * The file this came from, when it came from one. The import review page
   * uses it to show WHICH document claimed a room exists — the difference
   * between "the app invented a bathroom" and "your contract mentions one".
   */
  sourceFile?: string;
}

/** A reversible record of one applied action, used for one-tap undo. */
export type UndoOp =
  /** Nothing was written (e.g. a room the person merged into an existing one). */
  | { kind: "noop" }
  | { kind: "task_fields"; taskId: string; before: { status?: string | null; progress?: number | null; title?: string | null; description?: string | null; due_date?: string | null; start_date?: string | null; finish_date?: string | null; budget?: number | null; priority?: string | null } }
  | { kind: "delete_task"; taskId: string }
  | { kind: "delete_room"; roomId: string }
  | { kind: "delete_purchase"; purchaseOrderId: string; materialId: string }
  | { kind: "delete_comment"; commentId: string }
  | { kind: "delete_time"; timeEntryId: string }
  | { kind: "checklist_restore"; taskId: string; before: { checklists: unknown; progress: number | null } }
  | { kind: "task_assignee"; taskId: string; before: { assigned_to_stakeholder_id: string | null } }
  /** Imported document purchase: N material rows + the PO + uploaded file/links. */
  | { kind: "delete_import_purchase"; purchaseOrderId: string; materialIds: string[]; filePath?: string | null }
  /** Skiva 4: a plan drawn from an ingested drawing — undo deletes the plan. */
  | { kind: "delete_plan"; planId: string }
  /** E3: a default-rate change on the profile — undo restores the old value. */
  | { kind: "profile_rate"; profileId: string; field: "default_hourly_rate" | "default_markup_percent" | "default_material_markup_percent"; before: number | null };

/** Below this task-match confidence, a task proposal is shown unchecked (needs confirm/re-pick). */
export const TASK_MATCH_MIN_CONFIDENCE = 0.7;

export interface AgentRouteInput {
  kind: "text" | "voice_transcript" | "document";
  content: string;
}

/**
 * Context-scoped capture ("EN agent, MÅNGA dörrar"): which quick-action chip
 * the user tapped before speaking/typing. The router BIASES toward the hinted
 * action family but always follows a clearly different utterance.
 */
export type AgentIntentHint = "purchase" | "time" | "note" | "status";

export interface AgentRouteRequest {
  input: AgentRouteInput;
  projectId: string;
  language: string;
  intentHint?: AgentIntentHint | null;
}

export interface AgentRouteResponse {
  proposals: AgentProposal[];
  /** Honest pre-Genomför refusals from the normalize guards (e.g. broken-down budget). */
  refusals?: string[];
  transcript: string;
}

/** Proposals that mutate data (everything except `unknown`). */
export type ActionableProposal = AgentProposal & {
  action: Exclude<ProposalAction, { type: "unknown" }>;
};

export const isActionable = (p: AgentProposal): p is ActionableProposal =>
  p.action.type !== "unknown";

/** Default ConfirmDiff selection threshold. */
export const PROPOSAL_AUTOSELECT_CONFIDENCE = 0.5;
