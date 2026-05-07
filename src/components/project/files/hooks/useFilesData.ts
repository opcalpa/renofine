import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ProjectFile, ProjectFolder, FileLink, NamedEntity } from "../types";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface FilesDataResult {
  /** Files in the current folder */
  files: ProjectFile[];
  /** Sub-folders in the current folder */
  folders: ProjectFolder[];
  /** All files across all folders (for flat view + stats strip) */
  allProjectFiles: ProjectFile[];
  /** File-entity link records with resolved names */
  fileLinks: FileLink[];
  /** O(1) lookup: path → links */
  fileLinksMap: Map<string, FileLink[]>;
  /** Get links for a specific file path */
  getFileLinksForPath: (path: string) => FileLink[];
  /** Available tasks for linking dropdowns */
  availTasks: NamedEntity[];
  /** Available materials for linking dropdowns */
  availMaterials: NamedEntity[];
  /** Available rooms for linking dropdowns */
  availRooms: NamedEntity[];
  /** Current user's profile ID (for creating links) */
  currentProfileId: string | null;
  /** Loading state for current folder */
  loading: boolean;
  /** Loading state for flat/all-files fetch */
  loadingFlat: boolean;
  /** Re-fetch files in current folder */
  fetchFiles: () => Promise<void>;
  /** Re-fetch folders in current folder */
  fetchFolders: () => Promise<void>;
  /** Re-fetch all project files (flat view + stats) */
  fetchAllFiles: () => Promise<void>;
  /** Re-fetch file-entity links */
  fetchFileLinks: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFilesData(
  projectId: string,
  currentFolder: string,
): FilesDataResult {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [allProjectFiles, setAllProjectFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFlat, setLoadingFlat] = useState(false);

  // ---- File links ----
  const [fileLinks, setFileLinks] = useState<FileLink[]>([]);

  // ---- Available entities for linking ----
  const [availTasks, setAvailTasks] = useState<NamedEntity[]>([]);
  const [availMaterials, setAvailMaterials] = useState<NamedEntity[]>([]);
  const [availRooms, setAvailRooms] = useState<NamedEntity[]>([]);

  // ---- Current profile ID ----
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);

  // ---- Fetch files in current folder ----
  const fetchFiles = useCallback(async () => {
    const basePath = `projects/${projectId}/${currentFolder}`;
    const { data, error } = await supabase.storage
      .from("project-files")
      .list(basePath, { sortBy: { column: "name", order: "asc" } });

    if (error) {
      console.error("Failed to list files:", error);
      setLoading(false);
      return;
    }

    const fileList = (data || [])
      .filter((f) => f.name !== ".emptyFolderPlaceholder" && f.name.includes("."))
      .map((f) => {
        const filePath = `${basePath}/${f.name}`;
        const mime =
          (f.metadata as Record<string, unknown>)?.mimetype as string || "";
        let thumbnailUrl: string | undefined;
        if (mime.startsWith("image/")) {
          const {
            data: { publicUrl },
          } = supabase.storage
            .from("project-files")
            .getPublicUrl(filePath, {
              transform: { width: 100, height: 100, resize: "cover" },
            });
          thumbnailUrl = publicUrl;
        }
        return {
          id: f.id || f.name,
          name: f.name,
          path: filePath,
          size: ((f.metadata as Record<string, unknown>)?.size as number) || 0,
          type: mime,
          uploaded_at: f.created_at || "",
          uploaded_by: "",
          thumbnail_url: thumbnailUrl,
        } as ProjectFile;
      });

    setFiles(fileList);
    setLoading(false);
  }, [projectId, currentFolder]);

  // ---- Fetch folders ----
  const fetchFolders = useCallback(async () => {
    const basePath = `projects/${projectId}/${currentFolder}`;
    const { data } = await supabase.storage
      .from("project-files")
      .list(basePath, { sortBy: { column: "name", order: "asc" } });

    if (!data) return;

    const folderList = data
      .filter((f) => !f.name.includes(".") && f.name !== ".emptyFolderPlaceholder")
      .map((f) => ({
        id: f.id || f.name,
        name: f.name,
        path: currentFolder ? `${currentFolder}/${f.name}` : f.name,
      }));

    setFolders(folderList);
  }, [projectId, currentFolder]);

  // ---- Fetch all files recursively (flat view + stats strip) ----
  const fetchAllFiles = useCallback(async () => {
    setLoadingFlat(true);
    try {
      const basePath = `projects/${projectId}`;
      const result: ProjectFile[] = [];

      const listRecursive = async (path: string) => {
        const { data, error } = await supabase.storage
          .from("project-files")
          .list(path, { sortBy: { column: "name", order: "asc" } });
        if (error || !data) return;

        for (const item of data) {
          if (item.name === ".emptyFolderPlaceholder") continue;
          const fullPath = `${path}/${item.name}`;

          if (item.metadata?.mimetype) {
            let thumbnailUrl: string | undefined;
            if (item.metadata.mimetype.startsWith("image/")) {
              const {
                data: { publicUrl },
              } = supabase.storage
                .from("project-files")
                .getPublicUrl(fullPath, {
                  transform: { width: 100, height: 100, resize: "cover" },
                });
              thumbnailUrl = publicUrl;
            }
            result.push({
              id: item.id || item.name,
              name: item.name,
              path: fullPath,
              size: item.metadata?.size || 0,
              type: item.metadata?.mimetype || "unknown",
              uploaded_at: item.created_at || new Date().toISOString(),
              uploaded_by: "",
              folder:
                path.replace(basePath, "").replace(/^\//, "") || "/",
              thumbnail_url: thumbnailUrl,
            });
          } else if (!item.name.includes(".")) {
            await listRecursive(fullPath);
          }
        }
      };

      await listRecursive(basePath);
      setAllProjectFiles(result);
    } catch (err) {
      console.error("Failed to fetch all files:", err);
    } finally {
      setLoadingFlat(false);
    }
  }, [projectId]);

  // ---- Fetch file-entity links with name resolution ----
  const fetchFileLinks = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("task_file_links")
      .select(
        "id, file_path, task_id, material_id, room_id, file_type, invoice_date, invoice_amount, rot_amount, vendor_name, ai_summary",
      )
      .eq("project_id", projectId);
    if (!data) return;

    const taskIds = [
      ...new Set(data.filter((d) => d.task_id).map((d) => d.task_id!)),
    ];
    const matIds = [
      ...new Set(data.filter((d) => d.material_id).map((d) => d.material_id!)),
    ];
    const roomIds = [
      ...new Set(data.filter((d) => d.room_id).map((d) => d.room_id!)),
    ];

    const [tasksRes, matsRes, roomsRes] = await Promise.all([
      taskIds.length > 0
        ? supabase.from("tasks").select("id, title").in("id", taskIds)
        : { data: [] },
      matIds.length > 0
        ? supabase.from("materials").select("id, name").in("id", matIds)
        : { data: [] },
      roomIds.length > 0
        ? supabase.from("rooms").select("id, name").in("id", roomIds)
        : { data: [] },
    ]);

    const taskMap = new Map(
      (tasksRes.data || []).map((t) => [t.id, t.title]),
    );
    const matMap = new Map(
      (matsRes.data || []).map((m) => [m.id, m.name]),
    );
    const roomMap = new Map(
      (roomsRes.data || []).map((r) => [r.id, r.name]),
    );

    setFileLinks(
      data.map((d) => ({
        ...d,
        task_name: d.task_id ? taskMap.get(d.task_id) || undefined : undefined,
        material_name: d.material_id
          ? matMap.get(d.material_id) || undefined
          : undefined,
        room_name: d.room_id ? roomMap.get(d.room_id) || undefined : undefined,
      })),
    );
  }, [projectId]);

  // ---- O(1) lookup map ----
  const fileLinksMap = useMemo(() => {
    const map = new Map<string, FileLink[]>();
    for (const link of fileLinks) {
      const arr = map.get(link.file_path);
      if (arr) arr.push(link);
      else map.set(link.file_path, [link]);
    }
    return map;
  }, [fileLinks]);

  const getFileLinksForPath = useCallback(
    (path: string) => fileLinksMap.get(path) || [],
    [fileLinksMap],
  );

  // ---- Fetch available entities for linking dropdowns ----
  useEffect(() => {
    if (!projectId) return;
    Promise.all([
      supabase
        .from("tasks")
        .select("id, title")
        .eq("project_id", projectId)
        .order("title"),
      supabase
        .from("materials")
        .select("id, name")
        .eq("project_id", projectId)
        .order("name"),
      supabase
        .from("rooms")
        .select("id, name")
        .eq("project_id", projectId)
        .order("name"),
    ]).then(([t, m, r]) => {
      setAvailTasks(
        (t.data || []).map((x) => ({ id: x.id, name: x.title })),
      );
      setAvailMaterials(
        (m.data || []).map((x) => ({ id: x.id, name: x.name })),
      );
      setAvailRooms(
        (r.data || []).map((x) => ({ id: x.id, name: x.name })),
      );
    });
  }, [projectId]);

  // ---- Fetch current profile ID ----
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          if (data) setCurrentProfileId(data.id);
        });
    });
  }, []);

  // ---- Initial data fetch ----
  useEffect(() => {
    fetchFiles();
    fetchFolders();
  }, [fetchFiles, fetchFolders]);

  // ---- Fetch all files on mount (for stats strip) ----
  useEffect(() => {
    fetchAllFiles();
  }, [fetchAllFiles]);

  // ---- Fetch links when files change ----
  useEffect(() => {
    fetchFileLinks();
  }, [fetchFileLinks, files]);

  return {
    files,
    folders,
    allProjectFiles,
    fileLinks,
    fileLinksMap,
    getFileLinksForPath,
    availTasks,
    availMaterials,
    availRooms,
    currentProfileId,
    loading,
    loadingFlat,
    fetchFiles,
    fetchFolders,
    fetchAllFiles,
    fetchFileLinks,
  };
}
