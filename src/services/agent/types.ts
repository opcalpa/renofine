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
  | { type: "create_room"; name: string }
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
   * something Renaida shouldn't fill inline — contractor quote/invoice creation.
   * Applying it NAVIGATES; it writes no data and has no undo.
   */
  | { type: "open_feature"; feature: "new_quote" | "new_invoice"; label: string }
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
      lineItems: { description: string; quantity: number; unitPrice: number | null; total: number | null }[];
      attachmentKey?: string;
      /** D3: room attribution from the user's words at capture time
       *  ("här är kvittot, lägg det på badrummet") — allocates the order's lines. */
      roomId?: string | null;
      roomName?: string | null;
    }
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
}

/** A reversible record of one applied action, used for one-tap undo. */
export type UndoOp =
  | { kind: "task_fields"; taskId: string; before: { status?: string | null; progress?: number | null; title?: string | null; description?: string | null; due_date?: string | null; start_date?: string | null; finish_date?: string | null; budget?: number | null; priority?: string | null } }
  | { kind: "delete_task"; taskId: string }
  | { kind: "delete_room"; roomId: string }
  | { kind: "delete_purchase"; purchaseOrderId: string; materialId: string }
  | { kind: "delete_comment"; commentId: string }
  | { kind: "delete_time"; timeEntryId: string }
  | { kind: "checklist_restore"; taskId: string; before: { checklists: unknown; progress: number | null } }
  | { kind: "task_assignee"; taskId: string; before: { assigned_to_stakeholder_id: string | null } }
  /** Imported document purchase: N material rows + the PO + uploaded file/links. */
  | { kind: "delete_import_purchase"; purchaseOrderId: string; materialIds: string[]; filePath?: string | null };

/** Below this task-match confidence, a task proposal is shown unchecked (needs confirm/re-pick). */
export const TASK_MATCH_MIN_CONFIDENCE = 0.7;

export interface AgentRouteInput {
  kind: "text" | "voice_transcript" | "document";
  content: string;
}

export interface AgentRouteRequest {
  input: AgentRouteInput;
  projectId: string;
  language: string;
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
