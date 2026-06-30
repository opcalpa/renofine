/**
 * ConfirmDiff — the agentic keystone.
 *
 * Renders a list of AgentProposals as a reviewable, selectable diff. The user
 * confirms which to apply; nothing mutates until confirm. `unknown` proposals
 * are shown as clarification questions and are never selectable.
 *
 * Generalized from the upload→review→apply pattern in AIProjectImportModal.
 * See .claude/briefs/agentic-mvp.md.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  type AgentProposal,
  isActionable,
  PROPOSAL_AUTOSELECT_CONFIDENCE,
} from "@/services/agent/types";

interface ConfirmDiffProps {
  proposals: AgentProposal[];
  applying?: boolean;
  onConfirm: (accepted: AgentProposal[]) => void;
  onDismiss: () => void;
}

export function ConfirmDiff({ proposals, applying = false, onConfirm, onDismiss }: ConfirmDiffProps) {
  const { t } = useTranslation();

  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        proposals
          .filter((p) => isActionable(p) && p.confidence >= PROPOSAL_AUTOSELECT_CONFIDENCE)
          .map((p) => p.id),
      ),
  );

  const actionable = proposals.filter(isActionable);
  const unknowns = proposals.filter((p) => !isActionable(p));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectedCount = selected.size;

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <p className="mb-2 font-medium">{t("helpBot.agent.reviewTitle")}</p>

      <ul className="space-y-1.5">
        {actionable.map((p) => (
          <li key={p.id} className="flex items-start gap-2">
            <Checkbox
              id={`prop-${p.id}`}
              checked={selected.has(p.id)}
              onCheckedChange={() => toggle(p.id)}
              disabled={applying}
              className="mt-0.5"
            />
            <label htmlFor={`prop-${p.id}`} className="flex-1 cursor-pointer leading-snug">
              <span>{p.summary}</span>
              <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
                {p.action.type}
              </Badge>
            </label>
          </li>
        ))}
      </ul>

      {unknowns.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <HelpCircle className="h-3.5 w-3.5" />
            {t("helpBot.agent.needsClarification")}
          </p>
          <ul className="space-y-1">
            {unknowns.map((p) => (
              <li key={p.id} className="text-xs text-muted-foreground">
                {p.summary}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDismiss} disabled={applying}>
          {t("helpBot.agent.dismiss")}
        </Button>
        <Button
          size="sm"
          onClick={() => onConfirm(actionable.filter((p) => selected.has(p.id)))}
          disabled={applying || selectedCount === 0}
        >
          <Check className="mr-1 h-3.5 w-3.5" />
          {applying ? t("helpBot.agent.applying") : t("helpBot.agent.confirm")}
        </Button>
      </div>
    </div>
  );
}
