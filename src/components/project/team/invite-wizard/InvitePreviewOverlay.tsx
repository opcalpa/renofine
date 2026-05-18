import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, EyeOff } from "lucide-react";
import {
  getProjectAsPersona,
  type ProjectOverviewData,
} from "@/services/projectDataService";
import type { EconomyMode, InvitePersona } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  persona: InvitePersona;
  mode: EconomyMode;
}

const MAX_ROWS = 6;

function money(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("sv-SE").format(v) + " kr";
}

export function InvitePreviewOverlay({
  open,
  onOpenChange,
  projectId,
  persona,
  mode,
}: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ProjectOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Worker has no FeatureAccess preview; reviewer = no-economy read-only,
    // equivalent to member+none for the preview. Backend coerces mode.
    const apiPersona =
      persona === "worker" || persona === "reviewer" ? "member" : persona;
    getProjectAsPersona(projectId, apiPersona, mode)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, persona, mode]);

  const hidden = data?.viewer_mode !== "full";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {t("inviteWizard.preview.title", "Förhandsgranska som denna person")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "inviteWizard.preview.subtitle",
              "Så här ser projektet ut för personen med vald åtkomst.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-1">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive py-6 text-center">{error}</p>
          )}

          {data && !loading && (
            <>
              <section className="rounded-lg border p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {t("inviteWizard.preview.economy", "Ekonomi")}
                </h4>
                <dl className="text-sm space-y-1">
                  <Row label={t("inviteWizard.preview.totalBudget", "Total budget")} value={money(data.project.total_budget)} />
                  <Row label={t("inviteWizard.preview.spent", "Spenderat")} value={money(data.project.spent_amount)} />
                  <Row label={t("inviteWizard.preview.contract", "Kontraktssumma")} value={money(data.project.contract_value)} />
                </dl>
              </section>

              <section className="rounded-lg border p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {t("inviteWizard.preview.tasks", "Arbeten")} ({data.tasks.length})
                </h4>
                <ul className="text-sm divide-y">
                  {data.tasks.slice(0, MAX_ROWS).map((tk) => (
                    <li key={tk.id} className="flex justify-between gap-3 py-1">
                      <span className="truncate">{tk.title}</span>
                      <span className="text-muted-foreground shrink-0 font-mono text-xs">
                        {money(tk.budget)}
                      </span>
                    </li>
                  ))}
                  {data.tasks.length > MAX_ROWS && (
                    <li className="py-1 text-xs text-muted-foreground">
                      + {data.tasks.length - MAX_ROWS} {t("inviteWizard.preview.more", "till")}
                    </li>
                  )}
                </ul>
              </section>

              <section className="rounded-lg border p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {t("inviteWizard.preview.purchases", "Inköp")} ({data.materials.length})
                </h4>
                <ul className="text-sm divide-y">
                  {data.materials.slice(0, MAX_ROWS).map((m) => (
                    <li key={m.id} className="flex justify-between gap-3 py-1">
                      <span className="truncate">{m.name}</span>
                      <span className="text-muted-foreground shrink-0 font-mono text-xs">
                        {money(m.price_total)}
                      </span>
                    </li>
                  ))}
                  {data.materials.length > MAX_ROWS && (
                    <li className="py-1 text-xs text-muted-foreground">
                      + {data.materials.length - MAX_ROWS} {t("inviteWizard.preview.more", "till")}
                    </li>
                  )}
                </ul>
              </section>

              {hidden && (
                <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                  <EyeOff className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {t(
                      "inviteWizard.preview.maskedNote",
                      "“—” betyder att beloppet är dolt för den här personen med vald åtkomstnivå.",
                    )}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
    </div>
  );
}
