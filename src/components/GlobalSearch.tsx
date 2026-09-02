/**
 * GlobalSearch — the Cmd+K palette, across the projects you can actually reach.
 *
 * Four things were wrong here at once (Carl, 2026-09-02), and they compounded
 * into "search never finds what I want":
 *
 *  1. SCOPE. Only the `projects` query used `myProjectIds()`. The policies on
 *     tasks, materials and rooms all begin with `is_system_admin() OR …`, so a
 *     system admin was searching every user's data — the exact leak that was
 *     already fixed for projects and missed on the other three.
 *  2. DEMO. Those same tables carry an "Anyone can view public demo" policy, so
 *     the shared demo project's rooms and tasks surfaced in everyone's results.
 *  3. DEAD LINKS. Results navigated with `?taskId=`, `?materialId=`, `?roomId=`
 *     — parameters NOTHING reads. Only `entityId` is. So every hit opened the
 *     right tab and then sat there, never opening the thing you searched for.
 *  4. COVERAGE. The placeholder promised "tasks, purchases, files, rooms" while
 *     `purchase_orders` and files were never queried at all; "purchases" only
 *     ever matched individual material lines.
 *
 * Results now carry the path they were found at, so a hit reads
 * `Projekt › Furusundsgatan 14 › Inköp` rather than a bare name that could be
 * anywhere. The path uses the tabs' own labels, not table names.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_DEMO_PROJECT_TYPE } from "@/constants/publicDemo";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Input } from "@/components/ui/input";
import { Search, CheckSquare, Package, ShoppingCart, Home, FolderOpen, Loader2 } from "lucide-react";
import { myProjectIds } from "@/lib/myProjects";

interface SearchResult {
  id: string;
  type: "task" | "material" | "purchaseOrder" | "room" | "project";
  title: string;
  subtitle?: string;
  projectId: string;
  projectName?: string;
  /** i18n key for the tab this lives under — the middle of the breadcrumb. */
  tabKey?: string;
}

const TYPE_ICONS = {
  task: CheckSquare,
  material: Package,
  purchaseOrder: ShoppingCart,
  room: Home,
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
const TYPE_LABELS: Record<string, [key: string, fallback: string]> = {
  task: ["tasks.tasks", "Arbeten"],
  material: ["purchases.purchases", "Inköp"],
  purchaseOrder: ["purchases.purchaseOrdersTitle", "Inköpsorder"],
  room: ["rooms.rooms", "Rum"],
  project: ["projects.projects", "Projekt"],
};

/** Where each kind of hit lives, in the tabs' own words. */
const TYPE_TAB_KEY: Record<string, string | undefined> = {
  task: "nav.mobileNav.tasks",
  material: "nav.mobileNav.purchases",
  purchaseOrder: "nav.mobileNav.purchases",
  room: "nav.mobileNav.plans",
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
    const searchPattern = `%${q}%`;
    // PostgREST's `or=` filter is comma-separated, so a comma or a quote in the
    // term would break the whole clause. Strip them for the multi-column
    // lookups; single-column `ilike` takes the raw term unharmed.
    const orSafe = q.replace(/[,()"]/g, " ").trim();
    const allResults: SearchResult[] = [];

    try {
      // The reach of the person searching — owned, shared, or via the address,
      // WITHOUT the admin bypass the raw policies grant, and without the public
      // demo project everyone can read. Every query below is scoped to it.
      //
      // Fail closed: no reachable projects means no results, never "search
      // everything". An empty palette is a visible failure; a palette full of
      // strangers' projects is an invisible one.
      const ids = await myProjectIds();
      if (ids.length === 0) {
        setResults([]);
        setSelectedIndex(0);
        return;
      }

      const projectNames = new Map<string, string>();
      const push = (r: SearchResult) =>
        allResults.push({ ...r, tabKey: TYPE_TAB_KEY[r.type] });

      const [tasks, materials, orders, rooms, projects] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, project_id, projects(name)")
          .in("project_id", ids)
          .ilike("title", searchPattern)
          .limit(5),
        supabase
          .from("materials")
          .select("id, name, project_id, projects(name)")
          .in("project_id", ids)
          .ilike("name", searchPattern)
          .limit(5),
        // Purchase ORDERS — the thing the placeholder always promised and never
        // searched. "purchases" used to match only individual material lines,
        // so an invoice number or a vendor found nothing.
        supabase
          .from("purchase_orders")
          .select("id, vendor_name, total, invoice_number, ocr_number, project_id, projects(name)")
          .in("project_id", ids)
          .or(
            `vendor_name.ilike.%${orSafe}%,invoice_number.ilike.%${orSafe}%,ocr_number.ilike.%${orSafe}%`
          )
          .limit(5),
        supabase
          .from("rooms")
          .select("id, name, project_id, projects(name)")
          .in("project_id", ids)
          .ilike("name", searchPattern)
          .limit(5),
        supabase
          .from("projects")
          .select("id, name, description")
          .in("id", ids)
          .ilike("name", searchPattern)
          // NULL-safe. `.neq()` compiles to SQL `!=`, which is UNKNOWN against
          // NULL — and 69 of 77 projects have no project_type, so the plain
          // `.neq(project_type, public_demo)` silently excluded almost every
          // project in the database. Searching for a project by name returned
          // nothing, and looked like the search was simply bad.
          .or(`project_type.is.null,project_type.neq.${PUBLIC_DEMO_PROJECT_TYPE}`)
          .limit(3),
      ]);

      type WithProject = { project_id: string; projects: { name: string } | null };
      const nameOf = (row: WithProject) => {
        const n = row.projects?.name;
        if (n) projectNames.set(row.project_id, n);
        return n || projectNames.get(row.project_id);
      };

      for (const t of (tasks.data ?? []) as unknown as (WithProject & { id: string; title: string })[]) {
        push({ id: t.id, type: "task", title: t.title, projectId: t.project_id, projectName: nameOf(t) });
      }
      for (const m of (materials.data ?? []) as unknown as (WithProject & { id: string; name: string })[]) {
        push({ id: m.id, type: "material", title: m.name, projectId: m.project_id, projectName: nameOf(m) });
      }
      for (const o of (orders.data ?? []) as unknown as (WithProject & {
        id: string; vendor_name: string | null; total: number | null; invoice_number: string | null;
      })[]) {
        push({
          id: o.id,
          type: "purchaseOrder",
          // A read receipt can land without a vendor; the invoice number is the
          // next most recognisable handle, and the id is never shown raw.
          title:
            o.vendor_name ||
            (o.invoice_number ? `#${o.invoice_number}` : t("purchases.unknownVendor", "Okänd leverantör")),
          subtitle: o.total != null ? `${Math.round(o.total).toLocaleString("sv-SE")} kr` : undefined,
          projectId: o.project_id,
          projectName: nameOf(o),
        });
      }
      for (const r of (rooms.data ?? []) as unknown as (WithProject & { id: string; name: string })[]) {
        push({ id: r.id, type: "room", title: r.name, projectId: r.project_id, projectName: nameOf(r) });
      }
      for (const p of (projects.data ?? []) as { id: string; name: string; description: string | null }[]) {
        push({ id: p.id, type: "project", title: p.name, subtitle: p.description || undefined, projectId: p.id });
      }

      setResults(allResults);
      setSelectedIndex(0);
    } finally {
      setLoading(false);
    }
  }, [t]);

  /**
   * Open the hit — the ITEM, not just the tab it lives on.
   *
   * These links used to carry `?taskId=`, `?materialId=` and `?roomId=`.
   * ProjectDetail reads exactly one deep-link parameter, `entityId`, so every
   * one of those was inert: the tab opened and nothing else happened, which
   * reads as "search doesn't work".
   *
   * Rooms have no entityId consumer yet, so they still land on the plan tab —
   * honest, and no worse than before.
   */
  const handleSelect = useCallback((result: SearchResult) => {
    setOpen(false);
    const base = `/projects/${result.projectId}`;
    if (result.type === "project") {
      navigate(base);
    } else if (result.type === "task") {
      navigate(`${base}?tab=tasks&entityId=${result.id}`);
    } else if (result.type === "material" || result.type === "purchaseOrder") {
      navigate(`${base}?tab=purchases&entityId=${result.id}`);
    } else if (result.type === "room") {
      navigate(`${base}?tab=spaceplanner`);
    } else {
      navigate(base);
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
              placeholder={t("globalSearch.inputPlaceholder", "Sök arbeten, inköp, rum, projekt…")}
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
                    {TYPE_LABELS[type] ? t(TYPE_LABELS[type][0], TYPE_LABELS[type][1]) : type}
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
                                result.tabKey ? t(result.tabKey) : null,
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
