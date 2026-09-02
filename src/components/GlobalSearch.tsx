/**
 * GlobalSearch — the Cmd+K palette, across the projects you can actually reach.
 *
 * One RPC, `global_search(q)`, answers every keystroke: twelve entity types
 * unioned server-side (tasks with their descriptions and notes, materials,
 * purchase orders incl. amounts, rooms, room items, comments, field reports,
 * team members, workers, quotes, invoices, projects), scoped to
 * `my_project_ids()` — the gate — under the caller's RLS — the belt. The
 * five-parallel-queries version this replaced searched one field per table and
 * carried an admin leak, a demo leak, a NULL-unsafe filter and dead deep-links
 * (all fixed 2026-09-02); the RPC keeps coverage and scoping in ONE place, the
 * SQL function, so the client only maps type → icon, label, destination.
 *
 * Each hit shows the path it was found at — `Projekt › Furusundsgatan 14 ›
 * Inköp` — in the tabs' own words. Two rooms both named "Kök" stop being
 * interchangeable.
 *
 * Not covered yet: project files (no metadata table — see backlog
 * `global-sok-hittar-filer`), home papers, time entries, photos.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Input } from "@/components/ui/input";
import {
  Search, CheckSquare, Package, ShoppingCart, Home, FolderOpen, Loader2,
  Puzzle, MessageSquare, ClipboardList, Users, HardHat, FileText, Receipt,
} from "lucide-react";

type EntityType =
  | "task" | "material" | "purchaseOrder" | "room" | "roomItem"
  | "comment" | "fieldReport" | "member" | "worker"
  | "quote" | "invoice" | "project";

interface SearchResult {
  id: string;
  type: EntityType;
  title: string;
  subtitle?: string;
  projectId: string;
  projectName?: string;
  /** For comments/field reports: the task to open, when there is one. */
  taskId?: string;
}

/** One row from the global_search RPC. */
interface GlobalSearchRow {
  entity_type: string;
  entity_id: string;
  project_id: string;
  project_name: string | null;
  title: string | null;
  snippet: string | null;
  meta: { total?: number; task_id?: string } | null;
}

const TYPE_ICONS: Record<EntityType, typeof Search> = {
  task: CheckSquare,
  material: Package,
  purchaseOrder: ShoppingCart,
  room: Home,
  roomItem: Puzzle,
  comment: MessageSquare,
  fieldReport: ClipboardList,
  member: Users,
  worker: HardHat,
  quote: FileText,
  invoice: Receipt,
  project: FolderOpen,
};

/**
 * Group headings, each with the words to fall back on.
 *
 * `purchases.purchases`, `rooms.rooms` and `projects.projects` did not exist in
 * any locale file, and the render called `t(key)` with no fallback — so the
 * palette had been shouting PURCHASES.PURCHASES at people. The keys are added
 * now; the fallback is here so a missing one degrades to a real word instead of
 * leaking the key again.
 */
const TYPE_LABELS: Record<EntityType, [key: string, fallback: string]> = {
  task: ["tasks.tasks", "Arbeten"],
  material: ["purchases.purchases", "Inköp"],
  purchaseOrder: ["purchases.purchaseOrdersTitle", "Inköpsorder"],
  room: ["rooms.rooms", "Rum"],
  roomItem: ["globalSearch.types.roomItems", "Rumsobjekt"],
  comment: ["globalSearch.types.comments", "Kommentarer"],
  fieldReport: ["globalSearch.types.reports", "Fältrapporter"],
  member: ["globalSearch.types.team", "Team"],
  worker: ["globalSearch.types.workers", "Arbetare"],
  quote: ["globalSearch.types.quotes", "Offerter"],
  invoice: ["globalSearch.types.invoices", "Fakturor"],
  project: ["projects.projects", "Projekt"],
};

/**
 * Where each kind of hit lives, in the tabs' own words. Quotes and invoices
 * are their own pages, not project tabs, so their crumb reuses the type label.
 */
const TYPE_TAB_KEY: Record<EntityType, [key: string, fallback: string] | undefined> = {
  task: ["nav.mobileNav.tasks", "Arbeten"],
  material: ["nav.mobileNav.purchases", "Inköp"],
  purchaseOrder: ["nav.mobileNav.purchases", "Inköp"],
  room: ["nav.mobileNav.plans", "Yta"],
  roomItem: ["nav.mobileNav.plans", "Yta"],
  comment: ["nav.mobileNav.tasks", "Arbeten"],
  fieldReport: ["nav.mobileNav.tasks", "Arbeten"],
  member: ["nav.mobileNav.team", "Team"],
  worker: ["nav.mobileNav.team", "Team"],
  quote: ["globalSearch.types.quotes", "Offerter"],
  invoice: ["globalSearch.types.invoices", "Fakturor"],
  project: undefined,
};

export function GlobalSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Cmd+K keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(query.trim()), 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const performSearch = useCallback(async (q: string) => {
    setLoading(true);
    try {
      // ONE round trip per keystroke. Coverage and scoping live in the SQL
      // function; an entity type this map does not know is dropped rather than
      // guessed at, so a server ahead of the client degrades to fewer groups,
      // never to broken rows.
      const { data, error } = await supabase.rpc("global_search", { q, per_type: 5 });
      if (error) {
        console.error("global_search failed:", error);
        setResults([]);
        setSelectedIndex(0);
        return;
      }
      const rows = ((data ?? []) as GlobalSearchRow[]).filter(
        (r): r is GlobalSearchRow & { entity_type: EntityType } => r.entity_type in TYPE_LABELS
      );
      setResults(
        rows.map((r) => ({
          id: r.entity_id,
          type: r.entity_type,
          title:
            r.title ||
            (r.entity_type === "purchaseOrder"
              ? t("purchases.unknownVendor", "Okänd leverantör")
              : "—"),
          subtitle:
            r.entity_type === "purchaseOrder" && r.meta?.total != null
              ? `${Math.round(Number(r.meta.total)).toLocaleString("sv-SE")} kr`
              : r.snippet ?? undefined,
          projectId: r.project_id,
          projectName: r.project_name ?? undefined,
          taskId: r.meta?.task_id ?? undefined,
        }))
      );
      setSelectedIndex(0);
    } finally {
      setLoading(false);
    }
  }, [t]);

  /**
   * Open the hit — the ITEM where a consumer exists, honestly the tab where
   * none does.
   *
   * entityId is read by the tasks, purchases and time tabs. Rooms and room
   * items have no consumer yet, so they land on the plan. Comments and field
   * reports open THEIR TASK when they have one — the report itself is not an
   * addressable surface. Quotes and invoices are their own pages.
   */
  const handleSelect = useCallback((result: SearchResult) => {
    setOpen(false);
    const base = `/projects/${result.projectId}`;
    switch (result.type) {
      case "project":
        navigate(base);
        break;
      case "task":
        navigate(`${base}?tab=tasks&entityId=${result.id}`);
        break;
      case "material":
      case "purchaseOrder":
        navigate(`${base}?tab=purchases&entityId=${result.id}`);
        break;
      case "room":
      case "roomItem":
        navigate(`${base}?tab=spaceplanner`);
        break;
      case "comment":
      case "fieldReport":
        navigate(result.taskId ? `${base}?tab=tasks&entityId=${result.taskId}` : base);
        break;
      case "member":
      case "worker":
        navigate(`${base}?tab=team`);
        break;
      case "quote":
        navigate(`/quotes/${result.id}`);
        break;
      case "invoice":
        navigate(`/invoices/${result.id}`);
        break;
    }
  }, [navigate]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  }, [results, selectedIndex, handleSelect]);

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  let flatIndex = -1;

  return (
    <>
      {/* Trigger button in header */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="⌘K"
      >
        <Search className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 gap-0 overflow-hidden max-md:!bottom-auto max-md:!rounded-t-none max-md:!rounded-b-2xl md:max-w-lg">
          <VisuallyHidden>
            <DialogTitle>{t("globalSearch.title", "Search")}</DialogTitle>
          </VisuallyHidden>
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("globalSearch.inputPlaceholder", "Sök i allt inom dina projekt…")}
              className="border-0 p-0 h-auto focus-visible:ring-0 text-base sm:text-sm"
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
          </div>

          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto">
            {query.length >= 2 && !loading && results.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("globalSearch.noResults", "No results found")}
              </p>
            )}

            {Object.entries(grouped).map(([type, items]) => {
              const Icon = TYPE_ICONS[type as keyof typeof TYPE_ICONS];
              return (
                <div key={type}>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-4 pt-3 pb-1">
                    {TYPE_LABELS[type as EntityType]
                      ? t(TYPE_LABELS[type as EntityType][0], TYPE_LABELS[type as EntityType][1])
                      : type}
                  </p>
                  {items.map((result) => {
                    flatIndex++;
                    const idx = flatIndex;
                    return (
                      <button
                        key={`${result.type}-${result.id}`}
                        className={`flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm transition-colors ${
                          idx === selectedIndex ? "bg-accent" : "hover:bg-muted"
                        }`}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium">{result.title}</p>
                          {/* The path to the hit. The leaf is the bold line
                              right above, so repeating it here would only cost
                              width — this is everything up TO the match. */}
                          {result.type !== "project" && result.projectName && (
                            <p className="truncate text-xs text-muted-foreground">
                              {[
                                t("globalSearch.projectsRoot", "Projekt"),
                                result.projectName,
                                TYPE_TAB_KEY[result.type]
                                  ? t(TYPE_TAB_KEY[result.type]![0], TYPE_TAB_KEY[result.type]![1])
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" › ")}
                            </p>
                          )}
                          {result.type === "project" && result.subtitle && (
                            <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Footer hint */}
          {results.length > 0 && (
            <div className="border-t px-4 py-2 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>↑↓ {t("globalSearch.navigate", "navigate")}</span>
              <span>↵ {t("globalSearch.open", "open")}</span>
              <span>esc {t("globalSearch.close", "close")}</span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
