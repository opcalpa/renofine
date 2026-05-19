/**
 * GlobalSearch — Cmd+K command palette for searching across all user projects.
 * Searches tasks, materials/purchases, files, rooms, and projects.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_DEMO_PROJECT_TYPE } from "@/constants/publicDemo";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Input } from "@/components/ui/input";
import { Search, CheckSquare, Package, FileText, Home, FolderOpen, Loader2 } from "lucide-react";

interface SearchResult {
  id: string;
  type: "task" | "material" | "file" | "room" | "project";
  title: string;
  subtitle?: string;
  projectId: string;
  projectName?: string;
}

const TYPE_ICONS = {
  task: CheckSquare,
  material: Package,
  file: FileText,
  room: Home,
  project: FolderOpen,
};

const TYPE_LABELS: Record<string, string> = {
  task: "tasks.tasks",
  material: "purchases.purchases",
  file: "files.files",
  room: "rooms.rooms",
  project: "projects.projects",
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
    const allResults: SearchResult[] = [];

    try {
      // Search tasks
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, project_id, projects(name)")
        .ilike("title", searchPattern)
        .limit(5);

      if (tasks) {
        for (const t of tasks as unknown as { id: string; title: string; project_id: string; projects: { name: string } | null }[]) {
          allResults.push({
            id: t.id,
            type: "task",
            title: t.title,
            projectId: t.project_id,
            projectName: t.projects?.name || undefined,
          });
        }
      }

      // Search materials/purchases
      const { data: materials } = await supabase
        .from("materials")
        .select("id, name, project_id, projects(name)")
        .ilike("name", searchPattern)
        .limit(5);

      if (materials) {
        for (const m of materials as unknown as { id: string; name: string; project_id: string; projects: { name: string } | null }[]) {
          allResults.push({
            id: m.id,
            type: "material",
            title: m.name,
            projectId: m.project_id,
            projectName: m.projects?.name || undefined,
          });
        }
      }

      // Search rooms
      const { data: rooms } = await supabase
        .from("rooms")
        .select("id, name, project_id, projects(name)")
        .ilike("name", searchPattern)
        .limit(5);

      if (rooms) {
        for (const r of rooms as unknown as { id: string; name: string; project_id: string; projects: { name: string } | null }[]) {
          allResults.push({
            id: r.id,
            type: "room",
            title: r.name,
            projectId: r.project_id,
            projectName: r.projects?.name || undefined,
          });
        }
      }

      // Search projects
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name, description")
        .ilike("name", searchPattern)
        .neq("project_type", PUBLIC_DEMO_PROJECT_TYPE)
        .limit(3);

      if (projects) {
        for (const p of projects) {
          allResults.push({
            id: p.id,
            type: "project",
            title: p.name,
            subtitle: p.description || undefined,
            projectId: p.id,
          });
        }
      }

      setResults(allResults);
      setSelectedIndex(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelect = useCallback((result: SearchResult) => {
    setOpen(false);
    if (result.type === "project") {
      navigate(`/projects/${result.projectId}`);
    } else if (result.type === "task") {
      navigate(`/projects/${result.projectId}?tab=tasks&taskId=${result.id}`);
    } else if (result.type === "material") {
      navigate(`/projects/${result.projectId}?tab=purchases&materialId=${result.id}`);
    } else if (result.type === "room") {
      navigate(`/projects/${result.projectId}?tab=spaceplanner&roomId=${result.id}`);
    } else {
      navigate(`/projects/${result.projectId}`);
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
              placeholder={t("globalSearch.inputPlaceholder", "Search tasks, purchases, files, rooms...")}
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
                    {t(TYPE_LABELS[type] || type)}
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
                          {result.projectName && result.type !== "project" && (
                            <p className="text-xs text-muted-foreground truncate">{result.projectName}</p>
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
