import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compressImage";
import { toast } from "sonner";
import { fetchPinterestPin, parsePinterestPinUrl } from "@/services/pinterestOEmbed";
import { parsePinterestBoardUrl } from "@/components/pinterest";
import type { InspoPhoto, CropShape } from "../types";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface InspirationActionsResult {
  uploading: boolean;
  baUploading: boolean;
  handleUpload: (files: FileList | File[]) => Promise<void>;
  handleBeforeAfterUpload: (file: File, category: "before" | "during" | "after", roomId: string | null) => Promise<void>;
  handleUrlImport: () => Promise<void>;
  urlInput: string;
  setUrlInput: (val: string) => void;
  showUrlInput: boolean;
  setShowUrlInput: (val: boolean) => void;
  assignPhoto: (photoId: string, type: string, entityId: string) => Promise<void>;
  deletePhoto: (photoId: string) => Promise<void>;
  updateCaption: (photoId: string, caption: string) => Promise<void>;
  createRoomAndLink: (name: string, photoId?: string) => Promise<void>;
  newRoomName: string;
  setNewRoomName: (val: string) => void;
  creatingRoom: boolean;
  updateGridSpan: (photoId: string, colSpan: number, rowSpan: number) => void;
  toggleCircle: (photoId: string, isCircle: boolean) => Promise<void>;
  saveCropTransform: (photoId: string, zoom: number, offsetX: number, offsetY: number) => void;
  reorderPhotos: (dragId: string, targetId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useInspirationActions(
  projectId: string,
  inspoView: string,
  baPhase: string,
  selectedRoom: string,
  filteredPhotos: InspoPhoto[],
  setEditingCaption: (id: string | null) => void,
): InspirationActionsResult {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [uploading, setUploading] = useState(false);
  const [baUploading, setBaUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["inspiration", projectId] }),
    [queryClient, projectId],
  );

  // ---- Upload ----
  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      if (uploading) return;
      setUploading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", user.id)
          .single();
        if (!profile) throw new Error("No profile");

        let uploaded = 0;
        for (const file of Array.from(files)) {
          if (!file.type.startsWith("image/")) continue;
          const uploadFile = await compressImage(file);
          const isCompressed = uploadFile !== file;
          const ext = isCompressed
            ? "jpg"
            : file.name.split(".").pop() || "jpg";
          const path = `projects/${projectId}/inspiration/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("project-files")
            .upload(path, uploadFile, {
              contentType: isCompressed ? "image/jpeg" : file.type,
            });
          if (uploadError) {
            console.error("Inspiration upload failed:", uploadError);
            toast.error(uploadError.message || t("common.error"));
            continue;
          }
          const { data: publicUrl } = supabase.storage
            .from("project-files")
            .getPublicUrl(path);

          const isBA = inspoView === "beforeafter";
          const roomId =
            selectedRoom !== "all" && selectedRoom !== "untagged"
              ? selectedRoom
              : null;
          await supabase.from("photos").insert({
            linked_to_type: isBA && roomId ? "room" : "project",
            linked_to_id: isBA && roomId ? roomId : projectId,
            url: publicUrl.publicUrl,
            caption: null,
            uploaded_by_user_id: profile.id,
            source: isBA ? baPhase : "upload",
          });
          uploaded++;
        }
        if (uploaded > 0) {
          toast.success(t("inspiration.uploaded", { count: uploaded }));
          invalidate();
        }
      } catch {
        toast.error(t("common.error"));
      } finally {
        setUploading(false);
      }
    },
    [projectId, uploading, t, inspoView, baPhase, selectedRoom, invalidate],
  );

  // ---- Before/After upload ----
  const handleBeforeAfterUpload = useCallback(
    async (
      file: File,
      category: "before" | "during" | "after",
      roomId: string | null,
    ) => {
      setBaUploading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", user.id)
          .single();
        if (!profile) throw new Error("No profile");

        const uploadFile = await compressImage(file);
        const isCompressed = uploadFile !== file;
        const ext = isCompressed
          ? "jpg"
          : file.name.split(".").pop() || "jpg";
        const path = `projects/${projectId}/before-after/${category}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("project-files")
          .upload(path, uploadFile, {
            contentType: isCompressed ? "image/jpeg" : file.type,
          });
        if (uploadError) throw uploadError;

        const { data: publicUrl } = supabase.storage
          .from("project-files")
          .getPublicUrl(path);
        await supabase.from("photos").insert({
          linked_to_type: roomId ? "room" : "project",
          linked_to_id: roomId || projectId,
          url: publicUrl.publicUrl,
          uploaded_by_user_id: profile.id,
          source: category,
        });
        invalidate();
        toast.success(t("inspiration.photoAdded", "Bild tillagd"));
      } catch {
        toast.error(t("common.error"));
      } finally {
        setBaUploading(false);
      }
    },
    [projectId, t, invalidate],
  );

  // ---- URL import ----
  const handleUrlImport = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) throw new Error("No profile");

      const isPinterest = url.includes("pinterest");
      const pinUrl = parsePinterestPinUrl(url);

      if (pinUrl) {
        try {
          const pinData = await fetchPinterestPin(pinUrl, projectId);
          let finalUrl = pinData.storageUrl;
          if (!finalUrl && pinData.imageUrl) {
            try {
              const { data: proxyResult, error: proxyErr } =
                await supabase.functions.invoke("proxy-image", {
                  body: {
                    imageUrl: pinData.imageUrl,
                    projectId,
                    filename: `pin-${pinData.pinId}`,
                  },
                });
              if (!proxyErr && proxyResult?.storageUrl)
                finalUrl = proxyResult.storageUrl;
            } catch {
              /* proxy also failed */
            }
          }
          if (!finalUrl) {
            toast.error(t("inspiration.pinFetchFailed"));
            return;
          }
          await supabase.from("photos").insert({
            linked_to_type: "project",
            linked_to_id: projectId,
            url: finalUrl,
            caption: pinData.title || null,
            source: "pinterest",
            source_url: pinUrl,
            pinterest_pin_id: pinData.pinId,
            uploaded_by_user_id: profile.id,
          });
          toast.success(t("inspiration.pinImported"));
          setUrlInput("");
          setShowUrlInput(false);
          invalidate();
        } catch (pinErr) {
          console.error("Pinterest pin fetch failed:", pinErr);
          toast.error(t("inspiration.pinFetchFailed"));
        }
        return;
      }

      const boardParsed = parsePinterestBoardUrl(url);
      if (boardParsed) {
        toast.info(t("inspiration.boardHint"));
        setUrlInput("");
        setShowUrlInput(false);
        return;
      }

      if (isPinterest) {
        toast.error(t("inspiration.pinterestInvalid"));
        return;
      }

      await supabase.from("photos").insert({
        linked_to_type: "project",
        linked_to_id: projectId,
        url,
        source: "url",
        source_url: url,
        uploaded_by_user_id: profile.id,
      });
      toast.success(t("inspiration.imported"));
      setUrlInput("");
      setShowUrlInput(false);
      invalidate();
    } catch {
      toast.error(t("common.error"));
    } finally {
      setUploading(false);
    }
  }, [urlInput, projectId, t, invalidate]);

  // ---- Assign photo to entity ----
  const assignPhoto = useCallback(
    async (photoId: string, type: string, entityId: string) => {
      const { error } = await supabase
        .from("photos")
        .update({ linked_to_type: type, linked_to_id: entityId })
        .eq("id", photoId);
      if (error) {
        console.error("Failed to link photo:", error);
        toast.error(t("common.error"));
        return;
      }
      invalidate();
      toast.success(t("inspiration.linked"));
    },
    [t, invalidate],
  );

  // ---- Delete photo ----
  const deletePhoto = useCallback(
    async (photoId: string) => {
      await supabase.from("photos").delete().eq("id", photoId);
      invalidate();
    },
    [invalidate],
  );

  // ---- Update caption ----
  const captionSavingRef = useRef(false);
  const updateCaption = useCallback(
    async (photoId: string, caption: string) => {
      if (captionSavingRef.current) return;
      captionSavingRef.current = true;
      setEditingCaption(null);
      const { error } = await supabase
        .from("photos")
        .update({ caption: caption || null })
        .eq("id", photoId);
      if (error) toast.error(t("common.error"));
      invalidate();
      captionSavingRef.current = false;
    },
    [t, invalidate, setEditingCaption],
  );

  // ---- Create room and optionally link a photo ----
  const createRoomAndLink = useCallback(
    async (name: string, photoId?: string) => {
      if (!name.trim() || creatingRoom) return;
      setCreatingRoom(true);
      try {
        const { data, error } = await supabase
          .from("rooms")
          .insert({ project_id: projectId, name: name.trim() })
          .select("id")
          .single();
        if (error) {
          toast.error(error.message);
          return;
        }
        if (photoId && data) {
          await supabase
            .from("photos")
            .update({ linked_to_type: "room", linked_to_id: data.id })
            .eq("id", photoId);
        }
        invalidate();
        setNewRoomName("");
        toast.success(t("rooms.created", "Rum skapat"));
      } catch {
        toast.error(t("common.error"));
      } finally {
        setCreatingRoom(false);
      }
    },
    [projectId, creatingRoom, t, invalidate],
  );

  // ---- Grid span (optimistic + debounced) ----
  const spanSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateGridSpan = useCallback(
    (photoId: string, colSpan: number, rowSpan: number) => {
      const clamped = {
        col: Math.max(1, Math.min(6, colSpan)),
        row: Math.max(1, Math.min(6, rowSpan)),
      };
      queryClient.setQueryData(
        ["inspiration", projectId],
        (old: unknown) => {
          if (!old) return old;
          const prev = old as { photos: InspoPhoto[]; rooms: unknown; materialCards: unknown };
          return {
            ...prev,
            photos: prev.photos.map((p) =>
              p.id === photoId
                ? { ...p, gridColSpan: clamped.col, gridRowSpan: clamped.row }
                : p,
            ),
          };
        },
      );
      if (spanSaveTimer.current) clearTimeout(spanSaveTimer.current);
      spanSaveTimer.current = setTimeout(async () => {
        await supabase
          .from("photos")
          .update({
            grid_col_span: clamped.col,
            grid_row_span: clamped.row,
          })
          .eq("id", photoId);
      }, 300);
    },
    [projectId, queryClient],
  );

  // ---- Toggle circle shape ----
  const toggleCircle = useCallback(
    async (photoId: string, isCircle: boolean) => {
      const shape: CropShape = isCircle ? "landscape" : "circle";
      const updates =
        shape === "circle"
          ? { crop_shape: shape, grid_col_span: 3, grid_row_span: 3 }
          : { crop_shape: shape };
      queryClient.setQueryData(
        ["inspiration", projectId],
        (old: unknown) => {
          if (!old) return old;
          const prev = old as { photos: InspoPhoto[]; rooms: unknown; materialCards: unknown };
          return {
            ...prev,
            photos: prev.photos.map((p) =>
              p.id === photoId
                ? {
                    ...p,
                    cropShape: shape,
                    ...(shape === "circle"
                      ? { gridColSpan: 3, gridRowSpan: 3 }
                      : {}),
                  }
                : p,
            ),
          };
        },
      );
      await supabase.from("photos").update(updates).eq("id", photoId);
    },
    [projectId, queryClient],
  );

  // ---- Save crop transform (optimistic + debounced) ----
  const cropSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveCropTransform = useCallback(
    (photoId: string, zoom: number, offsetX: number, offsetY: number) => {
      queryClient.setQueryData(
        ["inspiration", projectId],
        (old: unknown) => {
          if (!old) return old;
          const prev = old as { photos: InspoPhoto[]; rooms: unknown; materialCards: unknown };
          return {
            ...prev,
            photos: prev.photos.map((p) =>
              p.id === photoId
                ? {
                    ...p,
                    cropZoom: zoom,
                    cropOffsetX: offsetX,
                    cropOffsetY: offsetY,
                  }
                : p,
            ),
          };
        },
      );
      if (cropSaveTimer.current) clearTimeout(cropSaveTimer.current);
      cropSaveTimer.current = setTimeout(async () => {
        await supabase
          .from("photos")
          .update({
            crop_zoom: zoom,
            crop_offset_x: offsetX,
            crop_offset_y: offsetY,
          })
          .eq("id", photoId);
      }, 300);
    },
    [projectId, queryClient],
  );

  // ---- Reorder photos ----
  const reorderPhotos = useCallback(
    async (dragId: string, targetId: string) => {
      if (dragId === targetId) return;
      const sorted = [...filteredPhotos].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      const dragIdx = sorted.findIndex((p) => p.id === dragId);
      const targetIdx = sorted.findIndex((p) => p.id === targetId);
      if (dragIdx === -1 || targetIdx === -1) return;

      const moved = sorted.splice(dragIdx, 1)[0];
      sorted.splice(targetIdx, 0, moved);

      const updates = sorted.map((p, i) => ({
        id: p.id,
        sort_order: i,
      }));
      await Promise.all(
        updates.map((u) =>
          supabase
            .from("photos")
            .update({ sort_order: u.sort_order })
            .eq("id", u.id),
        ),
      );
      invalidate();
    },
    [filteredPhotos, invalidate],
  );

  // Cleanup debounce timers
  useEffect(() => {
    return () => {
      if (spanSaveTimer.current) clearTimeout(spanSaveTimer.current);
      if (cropSaveTimer.current) clearTimeout(cropSaveTimer.current);
    };
  }, []);

  return {
    uploading,
    baUploading,
    handleUpload,
    handleBeforeAfterUpload,
    handleUrlImport,
    urlInput,
    setUrlInput,
    showUrlInput,
    setShowUrlInput,
    assignPhoto,
    deletePhoto,
    updateCaption,
    createRoomAndLink,
    newRoomName,
    setNewRoomName,
    creatingRoom,
    updateGridSpan,
    toggleCircle,
    saveCropTransform,
    reorderPhotos,
  };
}
