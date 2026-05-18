import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Crown, Pencil, X, Phone, Mail, ChevronDown, ChevronRight, Copy, MessageCircle, Send, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { FeatureAccessEditor } from "./FeatureAccessEditor";
import type { FeatureAccess } from "./FeatureAccessEditor";
import { isTeamV2MaskingEnabled } from "@/lib/featureFlags";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TeamRow {
  id: string;
  type: "owner" | "member" | "invitation" | "worker" | "rot";
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  roleTemplate: string;
  status: "active" | "pending" | "expired" | "revoked";
  addedDate: string | null;
  profileId: string | null;
  featureAccess: FeatureAccess | null;
  expiresAt: string | null;
  company: string | null;
  contractorCategory: string | null;
  notes: string | null;
  assignedTaskIds: string[] | null;
  assignedTaskNames: string[] | null;
  workerLanguage: string | null;
  workerToken: string | null;
  personnummerLast4: string | null;
}

interface TeamTableProps {
  rows: TeamRow[];
  currentProfileId: string | null;
  canManageTeam: boolean;
  isOwner: boolean;
  onEdit: (row: TeamRow) => void;
  onDelete: (row: TeamRow) => void;
  onCopyLink: (token: string) => void;
  onDm: (profileId: string, name: string) => void;
  onReinviteWorker?: (row: TeamRow) => void;
}

// v2 persona/mode pills — derived from data already on the row (no pipeline
// change). Display-only and feature-gated; best-effort labels.
interface Pill {
  label: string;
  cls: string;
}

function personaPill(row: TeamRow): Pill | null {
  if (row.type === "owner") return { label: "Ägare", cls: "bg-stone-200 text-stone-700" };
  if (row.type === "worker") return { label: "Worker", cls: "bg-amber-100 text-amber-800" };
  if (row.type === "rot") return null;
  if (row.role === "client" || row.roleTemplate === "client")
    return { label: "Klient", cls: "bg-emerald-100 text-emerald-800" };
  if (
    row.featureAccess?.teams === "invite" ||
    row.role === "admin" ||
    row.roleTemplate === "projectManager"
  )
    return { label: "PM / Co-owner", cls: "bg-rose-100 text-rose-800" };
  return { label: "UE-medlem", cls: "bg-sky-100 text-sky-800" };
}

function modePill(row: TeamRow): Pill | null {
  if (row.type === "owner") return { label: "Full ekonomi", cls: "bg-rose-50 text-rose-700" };
  if (row.type === "worker" || row.type === "rot") return null;
  if (row.role === "client" || row.roleTemplate === "client")
    return { label: "Klientvy", cls: "bg-emerald-50 text-emerald-700" };
  const fa = row.featureAccess;
  if (!fa) return null;
  if (fa.budget === "edit") return { label: "Full ekonomi", cls: "bg-rose-50 text-rose-700" };
  if (fa.purchases === "create" || fa.purchases === "edit")
    return { label: "Egna belopp", cls: "bg-emerald-50 text-emerald-700" };
  return { label: "Inga belopp", cls: "bg-muted text-muted-foreground" };
}

type SectionKey = "active" | "pending" | "inactive";

function getRowSection(row: TeamRow): SectionKey {
  if (row.status === "pending") return "pending";
  if (row.status === "revoked" || row.status === "expired") return "inactive";
  return "active";
}

const SECTION_ORDER: SectionKey[] = ["active", "pending", "inactive"];

// v2 filter pills — gated, display-only. Narrows which rows feed the
// section grouping; counts always derived from the full row set.
type FilterKey = "all" | "active" | "workers" | "expired";

const FILTER_ORDER: FilterKey[] = ["all", "active", "workers", "expired"];

const FILTER_LABEL: Record<FilterKey, [string, string]> = {
  all: ["team.filter.all", "Alla"],
  active: ["team.filter.active", "Aktiva"],
  workers: ["team.filter.workers", "Workers"],
  expired: ["team.filter.expired", "Utgångna"],
};

function matchesFilter(row: TeamRow, filter: FilterKey): boolean {
  switch (filter) {
    case "active":
      return row.status === "active";
    case "workers":
      return row.type === "worker";
    case "expired":
      return row.status === "expired" || row.status === "revoked";
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-purple-100 text-purple-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-muted text-muted-foreground border-border",
  revoked: "bg-red-50 text-red-700 border-red-200",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TeamTable({
  rows,
  currentProfileId,
  canManageTeam,
  isOwner,
  onEdit,
  onDelete,
  onCopyLink,
  onDm,
  onReinviteWorker,
}: TeamTableProps) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const filterEnabled = isTeamV2MaskingEnabled();

  const filterCounts = useMemo(() => {
    const counts: Record<FilterKey, number> = { all: 0, active: 0, workers: 0, expired: 0 };
    for (const f of FILTER_ORDER) counts[f] = rows.filter((r) => matchesFilter(r, f)).length;
    return counts;
  }, [rows]);

  const grouped = useMemo(() => {
    const map: Record<SectionKey, TeamRow[]> = { active: [], pending: [], inactive: [] };
    const source = filterEnabled ? rows.filter((r) => matchesFilter(r, filter)) : rows;
    for (const row of source) {
      map[getRowSection(row)].push(row);
    }
    return map;
  }, [rows, filter, filterEnabled]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        {t("roles.noTeamMembers", "No team members yet.")}
      </p>
    );
  }

  const visibleSections = SECTION_ORDER.filter((s) => grouped[s].length > 0);
  const showSectionHeaders = visibleSections.length > 1;
  const filteredEmpty = filterEnabled && visibleSections.length === 0;

  const filterBar = filterEnabled && (
    <div className="flex flex-wrap items-center gap-1.5">
      {FILTER_ORDER.map((f) => {
        const [key, fallback] = FILTER_LABEL[f];
        const isActive = filter === f;
        return (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {t(key, fallback)}
            <span className="ml-1.5 tabular-nums opacity-70">{filterCounts[f]}</span>
          </button>
        );
      })}
    </div>
  );

  if (filteredEmpty) {
    return (
      <div className="space-y-3">
        {filterBar}
        <p className="text-sm text-muted-foreground py-8 text-center">
          {t("team.filter.empty", "Inga medlemmar matchar filtret.")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filterBar}
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[30%]">{t("team.table.name", "Name")}</TableHead>
          <TableHead className="w-[18%]">{t("team.table.role", "Role")}</TableHead>
          <TableHead className="w-[22%] hidden md:table-cell">{t("team.table.contact", "Contact")}</TableHead>
          <TableHead className="w-[12%]">{t("team.table.status", "Status")}</TableHead>
          <TableHead className="w-[10%] hidden lg:table-cell">{t("team.table.added", "Added")}</TableHead>
          <TableHead className="w-[8%] text-right">{""}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visibleSections.map((section) => (
          <Fragment key={`section-${section}`}>
            {showSectionHeaders && (
              <TableRow className="hover:bg-transparent border-b-0">
                <TableCell colSpan={6} className="py-2 pt-4">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t(`team.sections.${section}`, section)} · {grouped[section].length}
                  </span>
                </TableCell>
              </TableRow>
            )}
            {grouped[section].map((row) => {
              const isExpanded = expandedId === row.id;
              const canDm = row.profileId && currentProfileId && row.profileId !== currentProfileId;
              const isCurrentUser = !!(row.profileId && currentProfileId && row.profileId === currentProfileId);
              const isInactive = row.status === "revoked" || row.status === "expired";

              return (
                <Fragment key={row.id}>
                  {/* Main row */}
                  <TableRow
                    className={cn(
                      "cursor-pointer",
                      isExpanded && "bg-muted/30",
                      row.type === "owner" && "bg-primary/[0.03]",
                      isInactive && "opacity-60"
                    )}
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                  >
                {/* Name */}
                <TableCell>
                  <div className="flex items-center gap-3">
                    {row.type === "owner" ? (
                      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <Crown className="h-4 w-4 text-primary" />
                      </div>
                    ) : (
                      <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0", getAvatarColor(row.name))}>
                        {row.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{row.name}</p>
                        {isCurrentUser && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-medium border-primary/40 bg-primary/10 text-primary shrink-0">
                            {t("team.youBadge", "You")}
                          </Badge>
                        )}
                      </div>
                      {row.email && (
                        <p className="text-xs text-muted-foreground truncate">{row.email}</p>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
                    )}
                  </div>
                </TableCell>

                {/* Role */}
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    {row.role}
                    {row.roleTemplate === "custom" && (
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info
                              className="h-3.5 w-3.5 text-muted-foreground cursor-help"
                              aria-label={t("roles.customTooltip", "")}
                            />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[260px] text-xs leading-snug">
                            {t("roles.customTooltip", "Behörigheterna matchar inte någon färdig rollmall.")}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </span>
                  {row.contractorCategory && (
                    <p className="text-xs text-muted-foreground truncate">{row.contractorCategory}</p>
                  )}
                  {isTeamV2MaskingEnabled() && (() => {
                    const p = personaPill(row);
                    const m = modePill(row);
                    if (!p && !m) return null;
                    return (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p && (
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", p.cls)}>
                            {p.label}
                          </span>
                        )}
                        {m && (
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-mono", m.cls)}>
                            {m.label}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </TableCell>

                {/* Contact */}
                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                    {row.phone && (
                      <span className="flex items-center gap-1 truncate">
                        <Phone className="h-3 w-3 shrink-0" />
                        {row.phone}
                      </span>
                    )}
                    {row.email && (
                      <span className="flex items-center gap-1 truncate">
                        <Mail className="h-3 w-3 shrink-0" />
                        {row.email}
                      </span>
                    )}
                  </div>
                </TableCell>

                {/* Status */}
                <TableCell>
                  <Badge variant="outline" className={cn("text-[10px] font-medium", STATUS_STYLES[row.status])}>
                    {t(`team.status.${row.status}`, row.status)}
                  </Badge>
                </TableCell>

                {/* Added date */}
                <TableCell className="hidden lg:table-cell">
                  {row.addedDate && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {new Date(row.addedDate).toLocaleDateString("sv-SE")}
                    </span>
                  )}
                </TableCell>

                {/* Actions */}
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-0.5">
                    {canDm && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDm(row.profileId!, row.name)} title={t("dm.openChat")}>
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canManageTeam && row.type !== "owner" && (
                      <>
                        {(row.type === "member" || row.type === "invitation") && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(row)} title={t("roles.editMember")}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {row.type === "worker" && row.status === "active" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(row)} title={t("teamWorker.editPermissions", "Redigera behörighet")}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {row.type === "worker" && row.workerToken && row.status === "active" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onCopyLink(row.workerToken!)} title={t("teamWorker.copyLink")}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {row.type === "worker" && isInactive && onReinviteWorker && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onReinviteWorker(row)} title={t("teamWorker.reinvite", "Bjud in igen")}>
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {isOwner && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(row)} title={t("common.remove")}>
                            <X className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </TableCell>
                  </TableRow>

                  {/* Expanded detail row */}
                  {isExpanded && (
                    <TableRow key={`${row.id}-detail`} className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={6} className="py-4">
                        <ExpandedRowContent row={row} t={t} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </Fragment>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded row content
// ---------------------------------------------------------------------------

function ExpandedRowContent({ row, t }: { row: TeamRow; t: (key: string, fallback?: string) => string }) {
  return (
    <div className="space-y-4 px-2">
      {/* Contact info (visible on mobile where column is hidden) */}
      <div className="md:hidden">
        {(row.phone || row.email) && (
          <div className="flex flex-wrap gap-4 text-sm">
            {row.phone && (
              <a href={`tel:${row.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <Phone className="h-3.5 w-3.5" /> {row.phone}
              </a>
            )}
            {row.email && (
              <a href={`mailto:${row.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <Mail className="h-3.5 w-3.5" /> {row.email}
              </a>
            )}
          </div>
        )}
      </div>

      {/* Company + notes (members/invitations) */}
      {row.company && (
        <p className="text-sm text-muted-foreground">
          {t("roles.company", "Company")}: {row.company}
        </p>
      )}
      {row.notes && (
        <p className="text-sm text-muted-foreground">
          {t("common.notes", "Notes")}: {row.notes}
        </p>
      )}

      {/* Feature access (members/invitations) */}
      {row.featureAccess && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {t("team.table.access", "Access")}
          </p>
          <div className="max-w-md">
            <FeatureAccessEditor
              featureAccess={row.featureAccess}
              onChange={() => {}}
              idPrefix={`row-${row.id}`}
              readOnly
            />
          </div>
        </div>
      )}

      {/* Time-bounded access (specialist / auditor invites) */}
      {row.expiresAt && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {t("roles.accessExpires", "Tidsbegränsad åtkomst – upphör")}{" "}
          {new Date(row.expiresAt).toLocaleDateString()}
        </p>
      )}

      {/* Worker-specific: assigned tasks + language */}
      {row.type === "worker" && (
        <>
          {row.assignedTaskNames && row.assignedTaskNames.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                {t("teamWorker.assignedTasksList", "Assigned tasks")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {row.assignedTaskNames.map((name, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md bg-background border text-xs">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {row.workerLanguage && (
            <p className="text-xs text-muted-foreground">
              {t("teamWorker.workerLanguage", "Language")}: {row.workerLanguage}
            </p>
          )}
        </>
      )}

      {/* ROT-specific: personnummer */}
      {row.type === "rot" && row.personnummerLast4 && (
        <p className="text-sm text-muted-foreground">
          {t("roles.personnummer", "Personal number")}: ****-{row.personnummerLast4}
        </p>
      )}
    </div>
  );
}
