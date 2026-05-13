import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Crown, Pencil, X, ClipboardList, Phone, Mail, ChevronDown, ChevronRight, Copy, MessageCircle } from "lucide-react";
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
}: TeamTableProps) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        {t("roles.noTeamMembers", "No team members yet.")}
      </p>
    );
  }

  return (
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
        {rows.map((row) => {
          const isExpanded = expandedId === row.id;
          const canDm = row.profileId && currentProfileId && row.profileId !== currentProfileId;

          return (
            <Fragment key={row.id}>
              {/* Main row */}
              <TableRow
                className={cn(
                  "cursor-pointer",
                  isExpanded && "bg-muted/30",
                  row.type === "owner" && "bg-primary/[0.03]"
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
                      <p className="text-sm font-medium truncate">{row.name}</p>
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
      </TableBody>
    </Table>
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
