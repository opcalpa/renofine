import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatLocalDate } from "@/lib/dateUtils";

interface Task {
  id: string;
  title: string;
  hourly_rate: number | null;
}

interface LogTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  defaultRate: number;
  onSave: (entry: { taskId: string | null; date: string; hours: number; description: string; hourlyRate: number | null }) => Promise<void>;
  initial?: { taskId: string | null; date: string; hours: number; description: string };
}

export function LogTimeDialog({ open, onOpenChange, tasks, defaultRate, onSave, initial }: LogTimeDialogProps) {
  const { t } = useTranslation();
  const [taskId, setTaskId] = useState(initial?.taskId || "");
  const [date, setDate] = useState(initial?.date || formatLocalDate(new Date()));
  const [hours, setHours] = useState(initial?.hours?.toString() || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const h = parseFloat(hours);
    if (!h || h <= 0) return;
    setSaving(true);
    try {
      const selectedTask = tasks.find((t) => t.id === taskId);
      const hourlyRate = selectedTask?.hourly_rate || defaultRate || null;
      await onSave({
        taskId: taskId || null,
        date,
        hours: h,
        description: description.trim(),
        hourlyRate,
      });
      onOpenChange(false);
      setTaskId("");
      setHours("");
      setDescription("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? t("timeTracking.editEntry") : t("timeTracking.logTime")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t("timeTracking.task")}</Label>
            <Select value={taskId} onValueChange={setTaskId}>
              <SelectTrigger>
                <SelectValue placeholder={t("timeTracking.selectTask")} />
              </SelectTrigger>
              <SelectContent>
                {tasks.map((task) => (
                  <SelectItem key={task.id} value={task.id}>
                    {task.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("timeTracking.date")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>{t("timeTracking.hours")}</Label>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <Label>{t("timeTracking.notes")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t("timeTracking.notes")}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving || !hours || parseFloat(hours) <= 0}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
