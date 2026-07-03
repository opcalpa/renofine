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
}

export type ProposalAction =
  | { type: "update_task"; taskId: string; changes: Partial<TaskWritableFields> }
  | { type: "set_progress"; taskId: string; progress: number; status?: string }
  | { type: "create_task"; roomId?: string; title: string; description?: string }
  | { type: "create_purchase"; roomId?: string; item: string; quantity?: number; unit?: string }
  | { type: "add_note"; target: "task" | "room" | "project"; targetId: string; text: string }
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
  | { kind: "task_fields"; taskId: string; before: { status?: string | null; progress?: number | null; title?: string | null; description?: string | null } }
  | { kind: "delete_task"; taskId: string }
  | { kind: "delete_purchase"; purchaseOrderId: string; materialId: string }
  | { kind: "delete_comment"; commentId: string };

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
