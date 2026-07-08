import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";
import { CommentsSection } from "@/components/comments/CommentsSection";
import type { Task } from "../types";

interface NotesTabProps {
  task: Task;
  patch: (updates: Partial<Task>) => void;
  projectId: string;
}

type NoteView = "customer" | "internal";

/**
 * Anteckningar — switch between the customer's wishes (task.description, the
 * default view; mirrors the room card where description IS the wishes) and
 * internal notes (tasks.internal_notes — never exposed to workers).
 */
export function NotesTab({ task, patch, projectId }: NotesTabProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<NoteView>("customer");
  const internalSupported = "internal_notes" in task;

  const segment = (key: NoteView, label: string) => {
    const active = view === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setView(key)}
        className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
        style={{
          background: active ? "var(--rf-ink, hsl(var(--foreground)))" : "transparent",
          color: active ? "var(--rf-paper, hsl(var(--background)))" : "var(--rf-fg-muted, hsl(var(--muted-foreground)))",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-4 px-6 py-5">
      <div
        className="inline-flex w-fit items-center gap-1 rounded-full border p-1"
        style={{ borderColor: "var(--rf-hairline, hsl(var(--border)))", background: "var(--rf-surface, hsl(var(--card)))" }}
      >
        {segment("customer", t("tasks.customerWishes", "Kundens önskemål"))}
        {internalSupported && segment("internal", t("tasks.internalNotes", "Interna anteckningar"))}
      </div>

      {view === "customer" ? (
        <div className="space-y-1.5">
          <Textarea
            id="edit-task-description"
            value={task.description || ""}
            onChange={(e) => patch({ description: e.target.value })}
            rows={5}
            placeholder={t("tasks.customerWishesPlaceholder", "Vad vill kunden ha gjort? Beskrivning av arbetet…")}
            className="rounded-lg text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {t("tasks.customerWishesHint", "Syns för alla i projektet, även inbjudna arbetare.")}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Textarea
            id="edit-task-internal-notes"
            value={task.internal_notes || ""}
            onChange={(e) => patch({ internal_notes: e.target.value })}
            rows={5}
            placeholder={t("tasks.internalNotesPlaceholder", "Interna anteckningar — syns inte för arbetare…")}
            className="rounded-lg text-sm"
            style={{ background: "var(--rf-paper-2, hsl(var(--muted)))" }}
          />
          <p className="text-xs text-muted-foreground">
            {t("tasks.internalNotesHint", "Bara för dig och ditt team — delas aldrig med arbetare.")}
          </p>
        </div>
      )}

      {/* CommentsSection renders its own heading */}
      <div className="pt-2 border-t" style={{ borderColor: "var(--rf-hairline, hsl(var(--border)))" }}>
        <CommentsSection taskId={task.id} projectId={projectId} />
      </div>
    </div>
  );
}
