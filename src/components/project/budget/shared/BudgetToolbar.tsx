// Budget table toolbar: search, type/status filters, advanced filter panel,
// columns toggle, evidence summary chip, compact/fullscreen toggles, mobile
// overflow menu, group-by selector, clear-filters action. Owner and Contractor
// shells will both mount this once the budget split is done.
//
// Props are flat (each piece of state + setter) rather than packaged hook
// return objects so consumers can pass synthetic values if they ever need to.

import type { Dispatch, SetStateAction, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  Columns3,
  Layers,
  Maximize2,
  Minimize2,
  MoreVertical,
  Paperclip,
  Rows3,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { ColumnToggle } from "@/components/shared/ColumnToggle";
import { cn } from "@/lib/utils";
import type {
  BudgetRow,
  ColumnDef,
  ColumnKey,
  GroupByOption,
} from "./types";
import type {
  FilterAttachment,
  FilterType,
} from "./useBudgetFilters";
import { budgetStatusKey } from "./cellRenderers";

export interface BudgetToolbarProps {
  // Filter state
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  searchExpanded: boolean;
  setSearchExpanded: Dispatch<SetStateAction<boolean>>;
  filterType: FilterType;
  setFilterType: Dispatch<SetStateAction<FilterType>>;
  filterStatuses: Set<string>;
  setFilterStatuses: Dispatch<SetStateAction<Set<string>>>;
  filterRoom: string;
  setFilterRoom: Dispatch<SetStateAction<string>>;
  filterAssignee: string;
  setFilterAssignee: Dispatch<SetStateAction<string>>;
  filterCostCenter: string;
  setFilterCostCenter: Dispatch<SetStateAction<string>>;
  filterStartDate: string;
  setFilterStartDate: Dispatch<SetStateAction<string>>;
  filterFinishDate: string;
  setFilterFinishDate: Dispatch<SetStateAction<string>>;
  filterAttachment: FilterAttachment;
  setFilterAttachment: Dispatch<SetStateAction<FilterAttachment>>;
  hasAdvancedFilter: boolean;
  // Distinct lookup lists
  distinctRooms: { id: string; name: string }[];
  distinctAssignees: { id: string; name: string }[];
  distinctCostCenters: string[];
  distinctStatuses: { task: string[]; material: string[] };
  // Toolbar UI state
  showAdvancedFilters: boolean;
  setShowAdvancedFilters: Dispatch<SetStateAction<boolean>>;
  compactRows: boolean;
  setCompactRows: Dispatch<SetStateAction<boolean>>;
  isFullscreen: boolean;
  setIsFullscreen: Dispatch<SetStateAction<boolean>>;
  groupBy: GroupByOption;
  onGroupByChange: (v: GroupByOption) => void;
  // Columns
  effectiveExtraKeys: ColumnKey[];
  allColumns: ColumnDef[];
  visibleExtras: Set<ColumnKey>;
  onToggleExtraColumn: (k: ColumnKey) => void;
  // Computed
  filtered: BudgetRow[];
  onClearAllFilters: () => void;
}

export function BudgetToolbar(props: BudgetToolbarProps): ReactNode {
  const { t } = useTranslation();
  const {
    searchQuery, setSearchQuery, searchExpanded, setSearchExpanded,
    filterType, setFilterType,
    filterStatuses, setFilterStatuses,
    filterRoom, setFilterRoom,
    filterAssignee, setFilterAssignee,
    filterCostCenter, setFilterCostCenter,
    filterStartDate, setFilterStartDate,
    filterFinishDate, setFilterFinishDate,
    filterAttachment, setFilterAttachment,
    hasAdvancedFilter,
    distinctRooms, distinctAssignees, distinctCostCenters, distinctStatuses,
    showAdvancedFilters, setShowAdvancedFilters,
    compactRows, setCompactRows,
    isFullscreen, setIsFullscreen,
    groupBy, onGroupByChange,
    effectiveExtraKeys, allColumns, visibleExtras, onToggleExtraColumn,
    filtered, onClearAllFilters,
  } = props;

  return (
    <>
      {/* Filters */}
      <div className="flex flex-row flex-wrap items-end gap-2 md:gap-4 mb-4">
        <div className={`transition-all duration-200 ${searchQuery || searchExpanded ? "min-w-[140px] max-w-[200px]" : "w-8"}`}>
          {searchQuery || searchExpanded ? (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="budget-search"
                autoFocus
                placeholder={t('budget.filterByName')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => { if (!searchQuery) setSearchExpanded(false); }}
                className="pl-9 h-8"
              />
            </div>
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSearchExpanded(true)}
              title={t('budget.filterByName')}
            >
              <Search className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="w-[130px]">
          <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('budget.allTypes')}</SelectItem>
              <SelectItem value="task">{t('budget.tasks')}</SelectItem>
              <SelectItem value="material">{t('budget.materials')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status filter — multiselect */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-8 gap-1.5 text-sm font-normal">
              {filterStatuses.size === 0
                ? t('budget.status', 'Status')
                : filterStatuses.size === 1
                  ? t(`statuses.${budgetStatusKey([...filterStatuses][0])}`, t(`materialStatuses.${[...filterStatuses][0]}`, [...filterStatuses][0]))
                  : `${filterStatuses.size} ${t('budget.statusesSelected', 'valda')}`}
              <ChevronDown className="h-3.5 w-3.5 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            {filterStatuses.size > 0 && (
              <Button variant="ghost" size="sm" className="w-full justify-start text-xs mb-1" onClick={() => setFilterStatuses(new Set())}>
                {t('budget.clearFilter', 'Rensa filter')}
              </Button>
            )}
            {distinctStatuses.task.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{t('budget.task')}</div>
                {distinctStatuses.task.map((s) => (
                  <label key={`task-${s}`} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer">
                    <Checkbox
                      checked={filterStatuses.has(s)}
                      onCheckedChange={(checked) => {
                        const next = new Set(filterStatuses);
                        if (checked) next.add(s); else next.delete(s);
                        setFilterStatuses(next);
                      }}
                    />
                    <span className="text-sm">{t(`statuses.${budgetStatusKey(s)}`, s)}</span>
                  </label>
                ))}
              </>
            )}
            {distinctStatuses.material.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{t('budget.material')}</div>
                {distinctStatuses.material.map((s) => (
                  <label key={`mat-${s}`} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer">
                    <Checkbox
                      checked={filterStatuses.has(s)}
                      onCheckedChange={(checked) => {
                        const next = new Set(filterStatuses);
                        if (checked) next.add(s); else next.delete(s);
                        setFilterStatuses(next);
                      }}
                    />
                    <span className="text-sm">{t(`materialStatuses.${s}`, s)}</span>
                  </label>
                ))}
              </>
            )}
          </PopoverContent>
        </Popover>

        <Button
          variant={hasAdvancedFilter ? "default" : "outline"}
          size="icon"
          className="h-8 w-8 hidden sm:flex"
          onClick={() => setShowAdvancedFilters((prev) => !prev)}
          title={t('budget.advancedFilter')}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>

        <ColumnToggle
          columns={effectiveExtraKeys}
          labels={Object.fromEntries(allColumns.map(c => [c.key, c.label])) as Record<string, string>}
          visible={visibleExtras}
          onChange={(vis) => {
            for (const key of effectiveExtraKeys) {
              if (vis.has(key) !== visibleExtras.has(key)) onToggleExtraColumn(key);
            }
          }}
          trigger={
            <Button variant="outline" size="icon" className="h-8 w-8 hidden sm:flex" title={t('budget.columns')}>
              <Columns3 className="h-4 w-4" />
            </Button>
          }
        />

        {/* Evidence summary — clickable popover listing unverified items */}
        {(() => {
          const applicable = filtered.filter((r) => r.evidenceStatus && r.evidenceStatus !== "na");
          if (applicable.length === 0) return null;
          const verified = applicable.filter((r) => r.evidenceStatus === "verified").length;
          const missing = applicable.filter((r) => r.evidenceStatus === "missing").length;
          const unverified = applicable.filter((r) => r.evidenceStatus !== "verified");
          return (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={cn("text-xs tabular-nums px-2 py-1 rounded-md border hidden sm:inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity", missing > 0 ? "border-amber-300 text-amber-700 bg-amber-50" : "border-green-300 text-green-700 bg-green-50")}
                  title={t("evidence.summaryTooltip", "Visar hur många poster som har underlag (faktura/kvitto) kopplat. Klicka för lista.")}
                >
                  <span>{verified}/{applicable.length} {t("evidence.summaryLabel")}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="px-3 py-2.5 border-b">
                  <h4 className="text-sm font-semibold">{t("evidence.popoverTitle", "Verifieringsstatus")}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {missing > 0
                      ? t("evidence.popoverMissing", "{{count}} poster saknar underlag", { count: unverified.length })
                      : t("evidence.popoverAllGood", "Alla poster har underlag")}
                  </p>
                </div>
                {unverified.length > 0 && (
                  <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
                    {unverified.map((row) => (
                      <button
                        key={row.id}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left"
                        onClick={() => {
                          const el = document.getElementById(`budget-row-${row.id}`);
                          if (el) {
                            el.scrollIntoView({ behavior: "smooth", block: "center" });
                            el.classList.add("ring-2", "ring-amber-400");
                            setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 2000);
                          }
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{row.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{t(`budget.${row.type === "task" ? "tasks" : "materials"}`)}</p>
                        </div>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", row.evidenceStatus === "missing" ? "border-amber-300 text-amber-700 bg-amber-50" : "border-border text-muted-foreground")}>
                          {t(`evidence.${row.evidenceStatus}`, row.evidenceStatus)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          );
        })()}

        <Button
          variant={compactRows ? "default" : "outline"}
          size="icon"
          className="h-8 w-8 hidden sm:flex"
          onClick={() => setCompactRows((prev) => !prev)}
          title={t('budget.compactRows', 'Compact rows')}
        >
          <Rows3 className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 hidden sm:flex"
          onClick={() => setIsFullscreen((prev) => !prev)}
          title={t('budget.fullscreen', 'Fullscreen')}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>

        {/* Mobile overflow menu */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8 sm:hidden">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="end">
            <button
              type="button"
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              {t('budget.advancedFilter')}
            </button>
            <button
              type="button"
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left"
              onClick={() => setCompactRows((prev) => !prev)}
            >
              <Rows3 className="h-3.5 w-3.5 text-muted-foreground" />
              {t('budget.compactRows', 'Kompakt')}
            </button>
          </PopoverContent>
        </Popover>

        {/* Group by */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={groupBy !== "none" ? "default" : "outline"}
              size="icon"
              className="h-8 w-8"
              title={t("budget.groupNone")}
            >
              <Layers className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48" align="end">
            <div className="space-y-1">
              <p className="text-sm font-medium mb-2">{t("budget.groupBy", "Group by")}</p>
              {(["none", "room", "costCenter", "status"] as GroupByOption[]).map((opt) => (
                <label
                  key={opt}
                  className={`flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 hover:bg-accent ${groupBy === opt ? "bg-accent font-medium" : ""}`}
                  onClick={() => onGroupByChange(opt)}
                >
                  {opt === "none" && t("budget.groupNone")}
                  {opt === "room" && t("budget.groupByRoom")}
                  {opt === "costCenter" && t("budget.groupByCostCenter")}
                  {opt === "status" && t("budget.groupByStatus")}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {(searchQuery || filterType !== "all" || hasAdvancedFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAllFilters}
          >
            {t('budget.clearFilters')}
          </Button>
        )}
      </div>

      {/* Advanced Filters Row */}
      {showAdvancedFilters && (
        <div className="flex flex-wrap items-end gap-4 mb-4 p-4 bg-muted/30 rounded-lg border">
          {distinctRooms.length > 0 && (
            <div className="w-[160px]">
              <Label className="text-sm mb-1.5 block">{t('budget.room')}</Label>
              <Select value={filterRoom} onValueChange={setFilterRoom}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('budget.allRooms')}</SelectItem>
                  {distinctRooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {distinctAssignees.length > 0 && (
            <div className="w-[160px]">
              <Label className="text-sm mb-1.5 block">{t('budget.assignee')}</Label>
              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('budget.allAssignees')}</SelectItem>
                  {distinctAssignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {distinctCostCenters.length > 0 && (
            <div className="w-[160px]">
              <Label className="text-sm mb-1.5 block">{t('budget.costCenter')}</Label>
              <Select value={filterCostCenter} onValueChange={setFilterCostCenter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('budget.all')}</SelectItem>
                  {distinctCostCenters.map((cc) => (
                    <SelectItem key={cc} value={cc}>{cc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="w-[160px]">
            <Label className="text-sm mb-1.5 block">{t('budget.startDateFrom')}</Label>
            <Input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
            />
          </div>
          <div className="w-[160px]">
            <Label className="text-sm mb-1.5 block">{t('budget.finishDateTo')}</Label>
            <Input
              type="date"
              value={filterFinishDate}
              onChange={(e) => setFilterFinishDate(e.target.value)}
            />
          </div>
          <div className="w-[160px]">
            <Label className="text-sm mb-1.5 block">{t('budget.filterAttachment')}</Label>
            <Select value={filterAttachment} onValueChange={(v) => setFilterAttachment(v as FilterAttachment)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('budget.allAttachments')}</SelectItem>
                <SelectItem value="has">
                  <span className="flex items-center gap-1.5">
                    <Paperclip className="h-3 w-3" />
                    {t('budget.hasAttachment')}
                  </span>
                </SelectItem>
                <SelectItem value="missing">{t('budget.missingAttachment')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </>
  );
}
