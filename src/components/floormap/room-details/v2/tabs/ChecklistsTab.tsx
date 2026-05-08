import { useTranslation } from "react-i18next";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { RoomFormData, Checklist, ChecklistItem } from "../../types";

interface ChecklistsTabProps {
  formData: RoomFormData;
  updateFormData: (updates: Partial<RoomFormData>) => void;
}

export function ChecklistsTab({ formData, updateFormData }: ChecklistsTabProps) {
  const { t } = useTranslation();
  const checklists = formData.checklists || [];

  const addChecklist = () => {
    const newChecklist: Checklist = {
      id: crypto.randomUUID(),
      title: t("rooms.checklist", "Checklist"),
      items: [],
    };
    updateFormData({ checklists: [...checklists, newChecklist] });
  };

  return (
    <div className="flex flex-col gap-3 px-6 py-5">
      <Button type="button" variant="outline" size="sm" onClick={addChecklist} className="self-start">
        <Plus className="mr-1 h-3 w-3" />
        {t("rooms.addChecklist", "Lägg till checklista")}
      </Button>

      {checklists.map((checklist, clIdx) => {
        const completedCount = checklist.items.filter((i) => i.completed).length;
        const totalCount = checklist.items.length;
        const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        return (
          <div key={checklist.id} className="rounded-lg border" style={{ borderColor: "var(--rf-hairline)" }}>
            <Collapsible defaultOpen>
              <div className="flex items-center gap-2 px-3 py-2">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </CollapsibleTrigger>
                <Input
                  value={checklist.title}
                  onChange={(e) => {
                    const updated = [...checklists];
                    updated[clIdx] = { ...updated[clIdx], title: e.target.value };
                    updateFormData({ checklists: updated });
                  }}
                  className="h-7 border-none px-1 text-sm font-medium shadow-none focus-visible:ring-1"
                />
                {totalCount > 0 && (
                  <span className="rf-num whitespace-nowrap text-xs text-muted-foreground">
                    {completedCount}/{totalCount}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    const updated = checklists.filter((_, i) => i !== clIdx);
                    updateFormData({ checklists: updated });
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              {totalCount > 0 && (
                <div className="px-3 pb-1">
                  <Progress value={progressPct} className="h-1.5" />
                </div>
              )}
              <CollapsibleContent>
                <div className="space-y-1 px-3 pb-3">
                  {checklist.items.map((item, itemIdx) => (
                    <div key={item.id} className="group flex items-center gap-2">
                      <Checkbox
                        checked={item.completed}
                        onCheckedChange={(checked) => {
                          const updated = [...checklists];
                          const newItems = [...checklist.items];
                          newItems[itemIdx] = { ...newItems[itemIdx], completed: !!checked };
                          updated[clIdx] = { ...updated[clIdx], items: newItems };
                          updateFormData({ checklists: updated });
                        }}
                      />
                      <Input
                        value={item.title}
                        onChange={(e) => {
                          const updated = [...checklists];
                          const newItems = [...checklist.items];
                          newItems[itemIdx] = { ...newItems[itemIdx], title: e.target.value };
                          updated[clIdx] = { ...updated[clIdx], items: newItems };
                          updateFormData({ checklists: updated });
                        }}
                        className={`h-7 border-none px-1 text-sm shadow-none focus-visible:ring-1 ${
                          item.completed ? "text-muted-foreground line-through" : ""
                        }`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                        onClick={() => {
                          const updated = [...checklists];
                          const newItems = checklist.items.filter((_, i) => i !== itemIdx);
                          updated[clIdx] = { ...updated[clIdx], items: newItems };
                          updateFormData({ checklists: updated });
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Input
                    placeholder={t("rooms.addItem", "Lägg till punkt...")}
                    className="mt-1 h-7 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) {
                          const updated = [...checklists];
                          const newItem: ChecklistItem = {
                            id: crypto.randomUUID(),
                            title: val,
                            completed: false,
                          };
                          updated[clIdx] = { ...updated[clIdx], items: [...checklist.items, newItem] };
                          updateFormData({ checklists: updated });
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
