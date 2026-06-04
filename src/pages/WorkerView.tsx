import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, AlertCircle, Wrench, Layers, List, Languages } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WorkerTaskCard, type WorkerTask } from "@/components/worker/WorkerTaskCard";
import type { FloorPlanObject, WallObject } from "@/components/worker/roomObjectShared";
import { SwipeableRoomInstructions, groupWorkerTasksByRoom } from "@/components/room-instructions";
import { WorkerPurchaseRequestDialog } from "@/components/worker/WorkerPurchaseRequestDialog";
import {
  WorkerLanguageSelector,
  workerLangOverrideKey,
} from "@/components/worker/WorkerLanguageSelector";
import {
  compressImage,
  uploadWorkerPhoto,
  type WorkerPhotoCategory,
} from "@/components/worker/uploadWorkerPhoto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FloorPlanShape {
  id: string;
  roomId: string | null;
  points: Array<{ x: number; y: number }>;
  color: string;
  strokeColor: string;
  name: string | null;
}

interface WorkerViewData {
  projectName: string;
  workerName: string;
  language: string;
  welcomeMessage: string | null;
  canUploadPhotos: boolean;
  canToggleChecklist: boolean;
  canCreatePurchases?: boolean;
  canLogReceipts?: boolean;
  tasks: WorkerTask[];
  floorPlan: FloorPlanShape[] | null;
  floorPlanImage: { url: string; x: number; y: number } | null;
  floorPlanObjects?: FloorPlanObject[];
  wallObjects?: WallObject[];
}

type ErrorState = "not_found" | "expired" | "error" | null;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WorkerView() {
  const { token } = useParams<{ token: string }>();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState>(null);
  const [data, setData] = useState<WorkerViewData | null>(null);
  const [workerViewMode, setWorkerViewMode] = useState<"rooms" | "list">("rooms");
  // Translated welcome_message (filled when worker_language ≠ sv/en).
  // Original always stays on data.welcomeMessage so user can toggle back.
  const [welcomeTranslated, setWelcomeTranslated] = useState<string | null>(null);
  const [showOriginalGreeting, setShowOriginalGreeting] = useState(false);

  // Group tasks by room for swipe view
  const roomInstructions = useMemo(
    () => (data?.tasks ? groupWorkerTasksByRoom(data.tasks) : []),
    [data?.tasks]
  );

  useEffect(() => {
    if (!token) {
      setError("not_found");
      setLoading(false);
      return;
    }
    loadWorkerData();
  }, [token]);

  const loadWorkerData = async () => {
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke(
        "get-worker-data",
        { body: { token } }
      );

      if (fnError) {
        setError("error");
        return;
      }

      if (result?.error === "not_found") {
        setError("not_found");
        return;
      }
      if (result?.error === "expired") {
        setError("expired");
        return;
      }
      if (result?.error) {
        setError("error");
        return;
      }

      // Set language from worker token — unless worker has manually overridden it
      const override = token ? localStorage.getItem(workerLangOverrideKey(token)) : null;
      const effectiveLang = override || result.language;
      if (effectiveLang && effectiveLang !== i18n.language) {
        i18n.changeLanguage(effectiveLang);
      }

      const viewData = result as WorkerViewData;
      setData(viewData);

      // Auto-translate non-worker messages + welcome message when the worker's
      // language differs from sv/en. Originals stay intact; translations are
      // stored in a separate field (or state for welcome) so workers can
      // toggle "Show original" per-message later.
      const lang = effectiveLang;
      if (lang && lang !== "sv" && lang !== "en") {
        const allMessages = viewData.tasks.flatMap((t) =>
          t.messages.filter(
            (m) => !m.isWorker && m.content && !m.content.startsWith("🎤"),
          ),
        );
        const items: Array<{ id: string; content: string }> = allMessages.map(
          (m) => ({ id: m.id, content: m.content }),
        );
        const WELCOME_ID = "__welcome__";
        if (viewData.welcomeMessage) {
          items.push({ id: WELCOME_ID, content: viewData.welcomeMessage });
        }
        if (items.length > 0) {
          supabase.functions
            .invoke("translate-comments", {
              body: { comments: items, targetLanguage: lang },
            })
            .then(({ data: trData }) => {
              if (!trData?.translations) return;
              const trMap = new Map<string, string>(
                trData.translations.map(
                  (t: { id: string; translatedContent: string }) => [t.id, t.translatedContent],
                ),
              );
              const welcomeT = trMap.get(WELCOME_ID);
              if (welcomeT) setWelcomeTranslated(welcomeT);
              setData((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  tasks: prev.tasks.map((task) => ({
                    ...task,
                    messages: task.messages.map((msg) => ({
                      ...msg,
                      translatedContent: trMap.get(msg.id) || msg.translatedContent || null,
                    })),
                  })),
                };
              });
            })
            .catch((err) => console.error("Translation failed:", err));
        }
      }
    } catch (err) {
      console.error("Failed to load worker data:", err);
      setError("error");
    } finally {
      setLoading(false);
    }
  };

  // Real-time subscription for new messages on assigned tasks
  useEffect(() => {
    if (!data || data.tasks.length === 0) return;

    const taskIds = data.tasks.map((t) => t.id);
    const channel = supabase
      .channel(`worker-messages-${token}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `entity_type=eq.task`,
        },
        (payload) => {
          const newComment = payload.new as {
            id: string;
            content: string;
            created_at: string;
            author_display_name: string | null;
            entity_id: string;
            images: Array<{ id: string; url: string; filename?: string }> | null;
          };

          // Only add if it's for one of our assigned tasks
          if (!taskIds.includes(newComment.entity_id)) return;

          const isWorker = !!(newComment.author_display_name && newComment.author_display_name.includes("(worker)"));

          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              tasks: prev.tasks.map((t) =>
                t.id === newComment.entity_id
                  ? {
                      ...t,
                      messages: [
                        ...t.messages,
                        {
                          id: newComment.id,
                          content: newComment.content,
                          createdAt: newComment.created_at,
                          authorName: newComment.author_display_name || "",
                          isWorker,
                          images: newComment.images || [],
                        },
                      ],
                    }
                  : t
              ),
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [data?.tasks.length, token]);

  const handleTaskUpdate = useCallback(
    (taskId: string, updates: Partial<WorkerTask>) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === taskId ? { ...t, ...updates } : t
          ),
        };
      });
    },
    []
  );

  const handleRoomPhotoUpload = useCallback(
    async (
      taskId: string | null,
      roomId: string,
      category: WorkerPhotoCategory,
      file: File,
      progress?: number,
    ) => {
      if (!token) return;
      // Task-level upload wins over room-level. Task carries side-effects
      // (status → awaiting_review, auto-comment); room-level is just a
      // gallery contribution. The __none__ room id never has a real DB row.
      const useTaskLevel = !!taskId;
      const useRoomLevel = !useTaskLevel && roomId !== "__none__";
      try {
        const compressed = await compressImage(file);
        await uploadWorkerPhoto({
          token,
          file: compressed,
          taskId: useTaskLevel ? taskId! : undefined,
          roomId: useRoomLevel ? roomId : undefined,
          category,
          progress,
        });
        toast.success(t("worker.photoUploaded", "Photo uploaded"));
        await loadWorkerData();
      } catch (err) {
        console.error("Room photo upload failed:", err);
        toast.error(t("common.error", "Upload failed"));
      }
    },
    [token, t],
  );

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error states
  // -------------------------------------------------------------------------
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
          <h1 className="text-lg font-semibold">
            {error === "expired"
              ? t("worker.expired", "This link has expired")
              : error === "not_found"
              ? t("worker.notFound", "Link not found")
              : t("common.error", "Something went wrong")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {error === "expired"
              ? t("worker.expiredDescription", "Contact your project manager for a new link.")
              : error === "not_found"
              ? t("worker.notFoundDescription", "This link is invalid or has been revoked.")
              : t("worker.errorDescription", "Please try again later.")}
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // -------------------------------------------------------------------------
  // Main view
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sticky header */}
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-3 safe-area-top">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Wrench className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold truncate">{data.projectName}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {t("worker.hello", "Hello")}, {data.workerName}
            </p>
          </div>
          {token && <WorkerLanguageSelector token={token} />}
          {/* View toggle */}
          <div className="flex rounded-md border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setWorkerViewMode("rooms")}
              className={`p-1.5 rounded transition-colors ${workerViewMode === "rooms" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              <Layers className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setWorkerViewMode("list")}
              className={`p-1.5 rounded transition-colors ${workerViewMode === "list" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Welcome message from the inviter — auto-translated to the worker's
          language when available, with a toggle to see the original. */}
      {data.welcomeMessage && (
        <div className="max-w-lg mx-auto px-4 pt-3">
          <div className="rounded-md border bg-card p-3 text-sm">
            <p className="whitespace-pre-wrap leading-relaxed">
              {welcomeTranslated && !showOriginalGreeting
                ? welcomeTranslated
                : data.welcomeMessage}
            </p>
            {welcomeTranslated && (
              <button
                type="button"
                onClick={() => setShowOriginalGreeting((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Languages className="h-3 w-3" />
                {showOriginalGreeting
                  ? t("worker.showTranslated", "Visa översatt")
                  : t("worker.showOriginal", "Visa original")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Action bar — Be om inköp / Logga inköp */}
      {(data.canCreatePurchases !== false || data.canLogReceipts) && token && (
        <div className="max-w-lg mx-auto px-4 pt-3 flex justify-end">
          <WorkerPurchaseRequestDialog
            token={token}
            tasks={data.tasks.map((task) => ({ id: task.id, title: task.title }))}
            canCreatePurchases={data.canCreatePurchases !== false}
            canLogReceipts={!!data.canLogReceipts}
          />
        </div>
      )}

      {/* Content */}
      {data.tasks.length === 0 ? (
        <main className="max-w-lg mx-auto px-4 py-4 pb-[env(safe-area-inset-bottom,16px)]">
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">{t("worker.noTasks", "No tasks assigned yet.")}</p>
          </div>
        </main>
      ) : workerViewMode === "rooms" ? (
        <main className="max-w-lg mx-auto flex-1 flex flex-col pb-[env(safe-area-inset-bottom,16px)]">
          <SwipeableRoomInstructions
            rooms={roomInstructions}
            floorPlanShapes={data.floorPlan ?? undefined}
            floorPlanObjects={data.floorPlanObjects}
            wallObjects={data.wallObjects}
            canToggleChecklist={data.canToggleChecklist}
            canUploadPhotos={data.canUploadPhotos}
            onPhotoUpload={handleRoomPhotoUpload}
          />
        </main>
      ) : (
        <main className="max-w-lg mx-auto px-4 py-4 space-y-4 pb-[env(safe-area-inset-bottom,16px)]">
          <p className="text-xs text-muted-foreground">
            {t("worker.taskCount", "{{count}} tasks", { count: data.tasks.length })}
          </p>
          {data.tasks.map((task) => (
            <WorkerTaskCard
              key={task.id}
              task={task}
              token={token!}
              canToggleChecklist={data.canToggleChecklist}
              canUploadPhotos={data.canUploadPhotos}
              floorPlan={data.floorPlan}
              floorPlanImage={data.floorPlanImage}
              floorPlanObjects={data.floorPlanObjects}
              wallObjects={data.wallObjects}
              onTaskUpdate={handleTaskUpdate}
            />
          ))}
        </main>
      )}

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-muted-foreground/50">
        {t("worker.poweredBy", "Powered by Renofine")}
      </footer>
    </div>
  );
}
