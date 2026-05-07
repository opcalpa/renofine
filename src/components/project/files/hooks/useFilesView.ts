import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type {
  ProjectFile,
  ProjectFolder,
  FileLink,
  FileSortKey,
  FileColKey,
  FilesViewMode,
} from "../types";
import { ALL_FILE_COLS, DEFAULT_HIDDEN_COLS, FILE_TYPE_LABELS } from "../types";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface FilesViewResult {
  // View mode
  viewMode: FilesViewMode;
  changeViewMode: (mode: FilesViewMode) => void;

  // Sort
  fileSortKey: FileSortKey | null;
  fileSortDir: "asc" | "desc";
  toggleFileSort: (key: FileSortKey) => void;

  // Search & filter
  fileSearch: string;
  setFileSearch: (q: string) => void;
  categoryFilter: string | null;
  missingAmountFilter: string | null;
  handleCategoryFilter: (category: string | null) => void;
  handleMissingAmountFilter: (category: string) => void;
  clearCategoryFilter: () => void;

  // Columns
  hiddenFileCols: Set<FileColKey>;
  visibleFileCols: FileColKey[];
  toggleFileCol: (key: FileColKey) => void;
  fileColLabels: Record<FileColKey, string>;

  // Compact mode
  compactRows: boolean;
  toggleCompact: () => void;

  // Pinned column
  pinnedCol: "name" | FileSortKey | null;
  setPinnedCol: (col: "name" | FileSortKey | null) => void;

  // Batch selection
  selectedFiles: Set<string>;
  toggleFileSelection: (path: string) => void;
  toggleSelectAll: () => void;

  // Category overrides
  categoryOverrides: Record<string, string>;
  setCategoryForFile: (path: string, cat: string) => void;
  customCategories: string[];
  setCustomCategories: React.Dispatch<React.SetStateAction<string[]>>;
  guessCategory: (file: ProjectFile) => string;
  getCategoryForPath: (path: string) => string;

  // Derived lists
  filteredFolders: ProjectFolder[];
  filteredFiles: ProjectFile[];
  sortedFiles: ProjectFile[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFilesView(
  files: ProjectFile[],
  folders: ProjectFolder[],
  allProjectFiles: ProjectFile[],
  fileLinksMap: Map<string, FileLink[]>,
  getFileLinksForPath: (path: string) => FileLink[],
): FilesViewResult {
  const { t } = useTranslation();

  // ---- View mode ----
  const [viewMode, setViewMode] = useState<FilesViewMode>(() => {
    return (localStorage.getItem("files_view_mode") as FilesViewMode) || "folder";
  });
  const changeViewMode = useCallback((mode: FilesViewMode) => {
    setViewMode(mode);
    localStorage.setItem("files_view_mode", mode);
  }, []);

  // Track view mode before category filter so we can restore
  const [preFilterViewMode, setPreFilterViewMode] = useState<FilesViewMode | null>(null);

  // ---- Sort ----
  const [fileSortKey, setFileSortKey] = useState<FileSortKey | null>(null);
  const [fileSortDir, setFileSortDir] = useState<"asc" | "desc">("asc");
  const toggleFileSort = useCallback((key: FileSortKey) => {
    setFileSortKey((prev) => {
      if (prev === key) {
        setFileSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setFileSortDir("asc");
      return key;
    });
  }, []);

  // ---- Search & filter ----
  const [fileSearch, setFileSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [missingAmountFilter, setMissingAmountFilter] = useState<string | null>(null);

  const handleCategoryFilter = useCallback((category: string | null) => {
    if (category) {
      setPreFilterViewMode((prev) => prev ?? viewMode);
      changeViewMode("flat");
    } else {
      setPreFilterViewMode((prev) => {
        if (prev) changeViewMode(prev);
        return null;
      });
    }
    setCategoryFilter(category);
    setMissingAmountFilter(null);
  }, [viewMode, changeViewMode]);

  const handleMissingAmountFilter = useCallback((category: string) => {
    setPreFilterViewMode((prev) => prev ?? viewMode);
    changeViewMode("flat");
    setCategoryFilter(category);
    setMissingAmountFilter(category);
  }, [viewMode, changeViewMode]);

  const clearCategoryFilter = useCallback(() => {
    setCategoryFilter(null);
    setMissingAmountFilter(null);
    setPreFilterViewMode((prev) => {
      if (prev) changeViewMode(prev);
      return null;
    });
  }, [changeViewMode]);

  // ---- Columns ----
  const [hiddenFileCols, setHiddenFileCols] = useState<Set<FileColKey>>(() => {
    try {
      const saved = localStorage.getItem("files_hidden_cols");
      return saved
        ? new Set(JSON.parse(saved) as FileColKey[])
        : new Set<FileColKey>(DEFAULT_HIDDEN_COLS);
    } catch {
      return new Set<FileColKey>(DEFAULT_HIDDEN_COLS);
    }
  });
  const visibleFileCols = ALL_FILE_COLS.filter((k) => !hiddenFileCols.has(k));
  const toggleFileCol = useCallback((key: FileColKey) => {
    setHiddenFileCols((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      localStorage.setItem("files_hidden_cols", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const fileColLabels: Record<FileColKey, string> = useMemo(
    () => ({
      category: t("files.category", "Kategori"),
      task: t("common.task", "Arbete"),
      purchase: t("nav.purchases", "Inköp"),
      room: t("common.room", "Rum"),
      invoiceDate: t("files.invoiceDate", "Fakturadatum"),
      invoiceAmount: t("files.invoiceAmount", "Belopp"),
      rotAmount: t("files.rotAmount", "ROT-avdrag"),
      vendor: t("files.vendor", "Leverantör"),
      summary: t("files.aiSummary", "AI-sammanfattning"),
      type: t("budget.type", "Typ"),
      size: t("files.size", "Storlek"),
      uploaded: t("files.uploaded", "Uppladdad"),
    }),
    [t],
  );

  // ---- Compact mode ----
  const [compactRows, setCompactRows] = useState(
    () => localStorage.getItem("files_compact") === "true",
  );
  const toggleCompact = useCallback(() => {
    setCompactRows((prev) => {
      const next = !prev;
      localStorage.setItem("files_compact", String(next));
      return next;
    });
  }, []);

  // ---- Pinned column ----
  const [pinnedCol, setPinnedCol] = useState<"name" | FileSortKey | null>("name");

  // ---- Batch selection ----
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const toggleFileSelection = useCallback((path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }, []);

  // ---- Category overrides ----
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("files_cat_overrides") || "{}");
    } catch {
      return {};
    }
  });
  const setCategoryForFile = useCallback((path: string, cat: string) => {
    setCategoryOverrides((prev) => {
      const next = { ...prev, [path]: cat };
      localStorage.setItem("files_cat_overrides", JSON.stringify(next));
      return next;
    });
  }, []);
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("files_custom_cats") || "[]");
    } catch {
      return [];
    }
  });

  // ---- Category helpers ----
  const guessCategory = useCallback(
    (file: ProjectFile): string => {
      const links = getFileLinksForPath(file.path);
      for (const link of links) {
        const label = FILE_TYPE_LABELS[link.file_type];
        if (label) return label;
      }
      const p = file.path.toLowerCase();
      if (p.includes("/offerter/") || p.includes("offert")) return "Offert";
      if (p.includes("/fakturor/") || p.includes("faktura") || p.includes("invoice")) return "Faktura";
      if (p.includes("/kvitton/") || p.includes("kvitto") || p.includes("receipt")) return "Kvitto";
      if (p.includes("/ritningar/") || p.includes("ritning") || p.includes("floor-plan")) return "Ritning";
      if (p.includes("/kontrakt/") || p.includes("kontrakt") || p.includes("contract")) return "Kontrakt";
      return "";
    },
    [getFileLinksForPath],
  );

  const getCategoryForPath = useCallback(
    (path: string): string => {
      if (categoryOverrides[path]) return categoryOverrides[path];
      const links = getFileLinksForPath(path);
      for (const link of links) {
        const label = FILE_TYPE_LABELS[link.file_type];
        if (label) return label;
      }
      const p = path.toLowerCase();
      if (p.includes("/offerter/") || p.includes("offert")) return "Offert";
      if (p.includes("/fakturor/") || p.includes("faktura") || p.includes("invoice")) return "Faktura";
      if (p.includes("/kvitton/") || p.includes("kvitto") || p.includes("receipt")) return "Kvitto";
      if (p.includes("/ritningar/") || p.includes("ritning") || p.includes("floor-plan")) return "Ritning";
      if (p.includes("/kontrakt/") || p.includes("kontrakt") || p.includes("contract")) return "Kontrakt";
      return "";
    },
    [categoryOverrides, getFileLinksForPath],
  );

  // ---- Filtered lists ----
  const searchQ = fileSearch.toLowerCase().trim();

  const filteredFolders = useMemo(
    () =>
      searchQ || categoryFilter
        ? folders.filter((f) => !categoryFilter && f.name.toLowerCase().includes(searchQ))
        : folders,
    [folders, searchQ, categoryFilter],
  );

  const fileSource = viewMode === "flat" || viewMode === "grid" ? allProjectFiles : files;

  const filteredFiles = useMemo(() => {
    let result = fileSource;

    if (categoryFilter) {
      result = result.filter((f) => {
        const cat = categoryOverrides[f.path] || guessCategory(f);
        if (categoryFilter === "__unclassified__") return !cat;
        return cat === categoryFilter;
      });
      if (missingAmountFilter) {
        result = result.filter((f) => {
          const links = getFileLinksForPath(f.path);
          return !links.some((l) => l.invoice_amount != null);
        });
      }
    }

    if (searchQ) {
      result = result.filter((f) => {
        if (f.name.toLowerCase().includes(searchQ)) return true;
        const cat = (categoryOverrides[f.path] || guessCategory(f)).toLowerCase();
        if (cat.includes(searchQ)) return true;
        const links = getFileLinksForPath(f.path);
        return links.some(
          (l) =>
            l.task_name?.toLowerCase().includes(searchQ) ||
            l.material_name?.toLowerCase().includes(searchQ) ||
            l.room_name?.toLowerCase().includes(searchQ),
        );
      });
    }

    return result;
  }, [fileSource, categoryFilter, missingAmountFilter, searchQ, categoryOverrides, guessCategory, getFileLinksForPath]);

  // ---- Sorted files ----
  const sortedFiles = useMemo(() => {
    if (!fileSortKey) return filteredFiles;
    return [...filteredFiles].sort((a, b) => {
      let aVal = "";
      let bVal = "";
      if (fileSortKey === "name") {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else if (fileSortKey === "category") {
        aVal = (categoryOverrides[a.path] || guessCategory(a)).toLowerCase();
        bVal = (categoryOverrides[b.path] || guessCategory(b)).toLowerCase();
      } else if (fileSortKey === "type") {
        aVal = (a.type || "").toLowerCase();
        bVal = (b.type || "").toLowerCase();
      } else if (fileSortKey === "size") {
        return fileSortDir === "asc"
          ? (a.size || 0) - (b.size || 0)
          : (b.size || 0) - (a.size || 0);
      } else if (fileSortKey === "uploaded") {
        aVal = a.uploaded_at || "";
        bVal = b.uploaded_at || "";
      } else {
        const aLinks = fileLinksMap.get(a.path) || [];
        const bLinks = fileLinksMap.get(b.path) || [];
        const field =
          fileSortKey === "task"
            ? "task_name"
            : fileSortKey === "purchase"
              ? "material_name"
              : fileSortKey === "room"
                ? "room_name"
                : fileSortKey === "vendor"
                  ? "vendor_name"
                  : fileSortKey === "summary"
                    ? "ai_summary"
                    : fileSortKey === "invoiceDate"
                      ? "invoice_date"
                      : fileSortKey === "invoiceAmount"
                        ? "invoice_amount"
                        : "rot_amount";
        aVal = String(
          (aLinks[0] as Record<string, unknown>)?.[field] || "",
        ).toLowerCase();
        bVal = String(
          (bLinks[0] as Record<string, unknown>)?.[field] || "",
        ).toLowerCase();
      }
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return fileSortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredFiles, fileSortKey, fileSortDir, categoryOverrides, guessCategory, fileLinksMap]);

  // ---- toggleSelectAll needs filteredFiles ----
  const toggleSelectAll = useCallback(() => {
    setSelectedFiles((prev) => {
      if (prev.size === filteredFiles.length) return new Set();
      return new Set(filteredFiles.map((f) => f.path));
    });
  }, [filteredFiles]);

  return {
    viewMode,
    changeViewMode,
    fileSortKey,
    fileSortDir,
    toggleFileSort,
    fileSearch,
    setFileSearch,
    categoryFilter,
    missingAmountFilter,
    handleCategoryFilter,
    handleMissingAmountFilter,
    clearCategoryFilter,
    hiddenFileCols,
    visibleFileCols,
    toggleFileCol,
    fileColLabels,
    compactRows,
    toggleCompact,
    pinnedCol,
    setPinnedCol,
    selectedFiles,
    toggleFileSelection,
    toggleSelectAll,
    categoryOverrides,
    setCategoryForFile,
    customCategories,
    setCustomCategories,
    guessCategory,
    getCategoryForPath,
    filteredFolders,
    filteredFiles,
    sortedFiles,
  };
}
