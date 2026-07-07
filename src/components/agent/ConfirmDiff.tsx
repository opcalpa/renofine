/**
 * ConfirmDiff — the agentic keystone.
 *
 * Renders AgentProposals as a reviewable, selectable diff. The user confirms
 * which to apply; nothing mutates until confirm. Task-targeting proposals show
 * WHICH task they hit; when the match is uncertain (matchConfidence below
 * threshold) the row is unchecked and offers a manual re-pick among candidates.
 * `unknown` proposals are shown as questions and offer "create a task instead".
 *
 * See .claude/briefs/voice-capture-plan.md.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, HelpCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  type AgentProposal,
  type ProposalAction,
  isActionable,
  PROPOSAL_AUTOSELECT_CONFIDENCE,
  TASK_MATCH_MIN_CONFIDENCE,
} from "@/services/agent/types";

interface ConfirmDiffProps {
  proposals: AgentProposal[];
  applying?: boolean;
  onConfirm: (accepted: AgentProposal[]) => void;
  onDismiss: () => void;
}

const isTaskAction = (a: ProposalAction) =>
  a.type === "update_task" || a.type === "set_progress" || a.type === "log_time" || a.type === "assign_task";

function unknownTitle(p: AgentProposal): string {
  if (p.action.type === "unknown" && p.action.rawText && !p.action.rawText.trim().startsWith("{")) {
    return p.action.rawText;
  }
  return p.summary;
}

/**
 * Concrete values a proposal will write — shown under the summary so the user
 * confirms actual dates/amounts/items, not just a sentence about them.
 */
function actionDetails(
  action: ProposalAction,
  t: (key: string, fallback?: string, opts?: Record<string, unknown>) => string,
  locale: string,
): string[] {
  const fmtDate = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const details: string[] = [];

  switch (action.type) {
    case "update_task": {
      const c = action.changes;
      const cleared = t("helpBot.agent.detailCleared", "tas bort");
      if (c.due_date) details.push(`${t("helpBot.agent.detailDeadline", "Deadline")}: ${fmtDate(c.due_date)}`);
      else if (c.due_date === null) details.push(`${t("helpBot.agent.detailDeadline", "Deadline")}: ${cleared}`);
      if (c.start_date) details.push(`${t("helpBot.agent.detailStart", "Start")}: ${fmtDate(c.start_date)}`);
      else if (c.start_date === null) details.push(`${t("helpBot.agent.detailStart", "Start")}: ${cleared}`);
      if (typeof c.budget === "number") details.push(`${t("helpBot.agent.detailBudget", "Budget")}: ${c.budget.toLocaleString(locale)} kr`);
      else if (c.budget === null) details.push(`${t("helpBot.agent.detailBudget", "Budget")}: ${cleared}`);
      if (c.priority) details.push(`${t("helpBot.agent.detailPriority", "Prioritet")}: ${t(`tasks.priority${c.priority.charAt(0).toUpperCase()}${c.priority.slice(1)}`, c.priority)}`);
      if (typeof c.progress === "number") details.push(`${t("helpBot.agent.detailProgress", "Framsteg")}: ${c.progress}%`);
      if (c.status) details.push(`${t("helpBot.agent.detailStatus", "Status")}: ${c.status}`);
      break;
    }
    case "set_progress":
      details.push(`${t("helpBot.agent.detailProgress", "Framsteg")}: ${action.progress}%`);
      break;
    case "create_checklist":
      details.push(action.items.join(" · "));
      break;
    case "remove_checklist_item":
      details.push(`− ${action.itemText}`);
      break;
    case "log_time":
      details.push(`${action.hours} h${action.date ? ` · ${fmtDate(action.date)}` : ""}`);
      break;
    case "assign_task":
      details.push(`${t("helpBot.agent.detailAssignee", "Tilldelas")}: ${action.assigneeName ?? ""}`);
      break;
    case "create_purchase":
      if (action.quantity) details.push(`${action.quantity}${action.unit ? ` ${action.unit}` : " st"}`);
      break;
    case "add_note":
      details.push(`”${action.text.length > 90 ? action.text.slice(0, 90) + "…" : action.text}”`);
      break;
  }
  return details;
}

export function ConfirmDiff({ proposals, applying = false, onConfirm, onDismiss }: ConfirmDiffProps) {
  const { t, i18n } = useTranslation();

  const lowMatch = (p: AgentProposal) =>
    isActionable(p) && isTaskAction(p.action) &&
    typeof p.matchConfidence === "number" && p.matchConfidence < TASK_MATCH_MIN_CONFIDENCE;

  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        proposals
          .filter((p) => isActionable(p) && !lowMatch(p) && p.confidence >= PROPOSAL_AUTOSELECT_CONFIDENCE)
          .map((p) => p.id),
      ),
  );
  // Per-proposal re-picked task id (manual override of the router's choice)
  const [taskOverride, setTaskOverride] = useState<Record<string, string>>({});
  // Unknown proposals the user chose to turn into a new task
  const [asNewTask, setAsNewTask] = useState<Set<string>>(new Set());

  const actionable = proposals.filter(isActionable);
  const unknowns = proposals.filter((p) => !isActionable(p));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const pickTask = (id: string, taskId: string) => {
    setTaskOverride((prev) => ({ ...prev, [id]: taskId }));
    setSelected((prev) => new Set(prev).add(id)); // re-picking implies intent to apply
  };

  const convertToTask = (id: string) => {
    setAsNewTask((prev) => new Set(prev).add(id));
    setSelected((prev) => new Set(prev).add(id));
  };

  const buildAccepted = (): AgentProposal[] => {
    const out: AgentProposal[] = [];
    for (const p of proposals) {
      if (!selected.has(p.id)) continue;
      if (asNewTask.has(p.id)) {
        out.push({ ...p, action: { type: "create_task", title: unknownTitle(p) } });
        continue;
      }
      let action = p.action;
      const override = taskOverride[p.id];
      if (override && isTaskAction(action)) {
        action = { ...action, taskId: override } as ProposalAction;
      }
      out.push({ ...p, action });
    }
    return out;
  };

  const currentTaskId = (p: AgentProposal): string | undefined => {
    if (taskOverride[p.id]) return taskOverride[p.id];
    if (isTaskAction(p.action) && "taskId" in p.action) return p.action.taskId;
    return undefined;
  };

  const selectedCount = selected.size + [...asNewTask].filter((id) => selected.has(id)).length * 0;

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <p className="mb-2 font-medium">{t("helpBot.agent.reviewTitle")}</p>

      <ul className="space-y-2">
        {actionable.map((p) => {
          const taskAction = isTaskAction(p.action);
          const showPicker = taskAction && (p.candidates?.length ?? 0) > 0 && (lowMatch(p) || (p.candidates?.length ?? 0) > 1);
          // The summary sentence embeds the router's original task pick — when the
          // user re-picks in the dropdown, show the new target or the text lies
          const originalTaskId = taskAction && "taskId" in p.action ? p.action.taskId : undefined;
          const overriddenTitle = taskOverride[p.id] && taskOverride[p.id] !== originalTaskId
            ? p.candidates?.find((c) => c.id === taskOverride[p.id])?.title
            : undefined;
          return (
            <li key={p.id} className="flex items-start gap-2">
              <Checkbox
                id={`prop-${p.id}`}
                checked={selected.has(p.id)}
                onCheckedChange={() => toggle(p.id)}
                disabled={applying}
                className="mt-0.5 h-5 w-5 md:h-4 md:w-4"
              />
              <div className="flex-1">
                <label htmlFor={`prop-${p.id}`} className="cursor-pointer leading-snug">
                  <span>{p.summary}</span>
                  <Badge variant="secondary" className="ml-2 align-middle text-[10px]">{p.action.type}</Badge>
                  {overriddenTitle && (
                    <span className="ml-1 text-xs font-medium text-primary">→ {overriddenTitle}</span>
                  )}
                  {lowMatch(p) && !overriddenTitle && (
                    <span className="ml-1 text-[10px] text-amber-600">{t("helpBot.agent.uncertainMatch")}</span>
                  )}
                </label>
                {(() => {
                  const details = actionDetails(p.action, t, i18n.language);
                  return details.length > 0 ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{details.join("  ·  ")}</p>
                  ) : null;
                })()}
                {showPicker && (
                  <select
                    value={currentTaskId(p) ?? ""}
                    onChange={(e) => pickTask(p.id, e.target.value)}
                    disabled={applying}
                    className="mt-1 block w-full rounded border border-border bg-background px-2 py-2 text-sm md:py-1 md:text-xs"
                  >
                    {p.candidates!.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {unknowns.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <HelpCircle className="h-3.5 w-3.5" />
            {t("helpBot.agent.needsClarification")}
          </p>
          <ul className="space-y-1.5">
            {unknowns.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{p.summary}</span>
                {!asNewTask.has(p.id) ? (
                  <button
                    onClick={() => convertToTask(p.id)}
                    disabled={applying}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
                  >
                    <Plus className="h-3 w-3" />{t("helpBot.agent.createTask")}
                  </button>
                ) : (
                  <span className="shrink-0 text-[11px] text-primary">{t("helpBot.agent.willCreateTask")}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-11 px-4 md:h-9 md:px-3" onClick={onDismiss} disabled={applying}>
          {t("helpBot.agent.dismiss")}
        </Button>
        <Button
          size="sm"
          className="h-11 px-4 md:h-9 md:px-3"
          onClick={() => onConfirm(buildAccepted())}
          disabled={applying || selectedCount === 0}
        >
          <Check className="mr-1 h-3.5 w-3.5" />
          {applying ? t("helpBot.agent.applying") : t("helpBot.agent.confirm")}
        </Button>
      </div>
    </div>
  );
}
