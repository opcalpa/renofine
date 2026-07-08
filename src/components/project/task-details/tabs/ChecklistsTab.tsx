import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Task, Checklist, ChecklistItem } from "../types";

interface ChecklistsTabProps {
  task: Task;
  patch: (updates: Partial<Task>) => void;
  projectId: string;
}

export function ChecklistsTab({ task, patch, projectId }: ChecklistsTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);

  const updateChecklist = (clIdx: number, updates: Partial<Checklist>) => {
    const updated = [...(task.checklists || [])];
    updated[clIdx] = { ...updated[clIdx], ...updates };
    patch({ checklists: updated });
  };

  // Trash icon = destructive intent → persist IMMEDIATELY. Before, this only
  // touched local state, so closing without Save silently resurrected the
  // checklist (round-10 flag b). Local state updates only after the write lands.
  const deleteChecklist = async (clIdx: number) => {
    const updated = (task.checklists || []).filter((_, i) => i !== clIdx);
    const { error } = await supabase
      .from("tasks")
      .update({ checklists: updated as never })
      .eq("id", task.id);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return;
    }
    patch({ checklists: updated });
    toast({ description: t("tasks.checklistDeleted", "Checklistan togs bort") });
    // NOT onSaved — TasksTab closes the dialog on that (Cowork round 12).
    // The tasks table refetches via its renaida-data-changed listener instead.
    window.dispatchEvent(new CustomEvent("renaida-data-changed", { detail: { projectId } }));
  };

  const handleGenerateChecklist = async () => {
    if (!task.room_id) return;
    setGenerating(true);
    try {
      const { data: roomData } = await supabase
        .from("rooms")
        .select("name, wall_spec, floor_spec, ceiling_spec, joinery_spec, dimensions")
        .eq("id", task.room_id)
        .single();

      if (!roomData) throw new Error("Room not found");

      const { data: result, error } = await supabase.functions.invoke("generate-work-checklist", {
        body: {
          taskTitle: task.title,
          taskDescription: task.description,
          roomName: roomData.name,
          wallSpec: roomData.wall_spec,
          floorSpec: roomData.floor_spec,
          ceilingSpec: roomData.ceiling_spec,
          joinerySpec: roomData.joinery_spec,
          dimensions: roomData.dimensions,
        },
      });

      if (error) throw error;
      if (result?.checklist) {
        patch({ checklists: [...(task.checklists || []), result.checklist] });
        toast({ description: t("tasks.checklistGenerated", "Checklist generated from room specs") });
      }
    } catch (err) {
      console.error("Generate checklist failed:", err);
      toast({ title: t("common.error"), description: String(err), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-6 py-5">
      <div className="flex gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const newChecklist: Checklist = {
              id: crypto.randomUUID(),
              title: t("tasks.checklist"),
              items: [],
            };
            patch({ checklists: [...(task.checklists || []), newChecklist] });
          }}
        >
          <Plus className="h-3 w-3 mr-1" />
          {t("tasks.addChecklist")}
        </Button>
        {task.room_id && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleGenerateChecklist}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1" />
            )}
            {t("tasks.generateChecklist", "Generate from room")}
          </Button>
        )}
      </div>

      {(task.checklists || []).length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {t("tasks.noChecklistsYet", "Inga checklistor ännu — lägg till en eller generera från rummet.")}
        </p>
      )}

      {(task.checklists || []).map((checklist, clIdx) => {
        const completedCount = checklist.items.filter((i) => i.completed).length;
        const totalCount = checklist.items.length;
        const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        return (
          <div key={checklist.id} className="border rounded-lg bg-background">
            <Collapsible defaultOpen>
              <div className="flex items-center gap-2 px-3 py-2">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </CollapsibleTrigger>
                <Input
                  value={checklist.title}
                  onChange={(e) => updateChecklist(clIdx, { title: e.target.value })}
                  className="h-7 text-sm font-medium border-none shadow-none px-1 focus-visible:ring-1"
                />
                {totalCount > 0 && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{completedCount}/{totalCount}</span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteChecklist(clIdx)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              {totalCount > 0 && (
                <div className="px-3 pb-1"><Progress value={progressPct} className="h-1.5" /></div>
              )}
              <CollapsibleContent>
                <div className="px-3 pb-3 space-y-1">
                  {checklist.items.map((item, itemIdx) => (
                    <div key={item.id} className="flex items-center gap-2 group">
                      <Checkbox
                        checked={item.completed}
                        onCheckedChange={(checked) => {
                          const newItems = [...checklist.items];
                          newItems[itemIdx] = { ...newItems[itemIdx], completed: !!checked };
                          updateChecklist(clIdx, { items: newItems });
                        }}
                      />
                      <Input
                        value={item.title}
                        onChange={(e) => {
                          const newItems = [...checklist.items];
                          newItems[itemIdx] = { ...newItems[itemIdx], title: e.target.value };
                          updateChecklist(clIdx, { items: newItems });
                        }}
                        className={`h-7 text-sm border-none shadow-none px-1 focus-visible:ring-1 ${item.completed ? "line-through text-muted-foreground" : ""}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          const newItems = checklist.items.filter((_, i) => i !== itemIdx);
                          updateChecklist(clIdx, { items: newItems });
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Input
                    placeholder={t("tasks.addItem")}
                    className="h-7 text-sm mt-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) {
                          const newItem: ChecklistItem = { id: crypto.randomUUID(), title: val, completed: false };
                          updateChecklist(clIdx, { items: [...checklist.items, newItem] });
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        );
      })}
    </div>
  );
}
