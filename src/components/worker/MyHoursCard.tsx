import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Clock, X } from "lucide-react";

export interface MyHoursEntry {
  id: string;
  date: string;
  hours: number;
  status: "pending" | "approved" | "declined";
  taskTitle: string | null;
}

interface Props {
  entries: MyHoursEntry[];
}

const VISIBLE = 5;

/**
 * "Mina timmar" — the worker reading back what they reported.
 *
 * Hours used to leave the phone and never come back: reported, then invisible.
 * Nobody trusts a timesheet they cannot read, and "did my Tuesday go through?"
 * became a call to the builder — the exact call this feature exists to remove.
 *
 * Three states, never a checkbox: waiting is not the same as refused, and a
 * worker who cannot tell them apart reports the same day twice.
 */
export function MyHoursCard({ entries }: Props) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  const shown = expanded ? entries : entries.slice(0, VISIBLE);
  const total = entries.reduce((sum, e) => sum + e.hours, 0);

  const label = (s: MyHoursEntry["status"]) =>
    s === "approved"
      ? t("field.hoursApproved", "Godkänd")
      : s === "declined"
        ? t("field.hoursDeclined", "Nekad")
        : t("field.hoursPending", "Väntar");

  const icon = (s: MyHoursEntry["status"]) =>
    s === "approved" ? (
      <Check className="h-3.5 w-3.5 text-emerald-600" />
    ) : s === "declined" ? (
      <X className="h-3.5 w-3.5 text-destructive" />
    ) : (
      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
    );

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">{t("field.myHours", "Mina timmar")}</h2>
        <span className="text-xs text-muted-foreground">
          {t("field.myHoursTotal", "{{hours}} h senaste 14 dagarna", {
            hours: Number.isInteger(total) ? total : total.toFixed(1),
          })}
        </span>
      </div>

      <ul className="mt-2 divide-y">
        {shown.map((e) => (
          <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
            <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
              {new Date(e.date + "T00:00:00").toLocaleDateString(i18n.language, {
                day: "numeric",
                month: "short",
              })}
            </span>
            <span className="w-12 shrink-0 font-medium tabular-nums">
              {Number.isInteger(e.hours) ? e.hours : e.hours.toFixed(1)} h
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{e.taskTitle ?? ""}</span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              {icon(e.status)}
              {label(e.status)}
            </span>
          </li>
        ))}
      </ul>

      {entries.length > VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 min-h-[36px] w-full text-xs text-muted-foreground underline underline-offset-2"
        >
          {expanded
            ? t("common.showLess", "Visa färre")
            : t("field.showAllHours", "Visa alla ({{count}})", { count: entries.length })}
        </button>
      )}
    </div>
  );
}
