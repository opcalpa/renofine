import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CURRENCIES } from "@/lib/currency";
import { Separator } from "@/components/ui/separator";
import {
  STATUS_META,
  ALLOWED_TRANSITIONS,
  normalizeStatus,
  type ProjectStatus,
} from "@/lib/projectStatus";
import type { OverviewProject } from "./types";
import { parseLocalDate, formatLocalDate } from "@/lib/dateUtils";
import { updateGuestProject } from "@/services/guestStorageService";

const CURRENCY_OPTIONS = Object.entries(CURRENCIES).map(([code, config]) => ({
  value: code,
  label: `${code} (${config.symbol})`,
}));

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: OverviewProject;
  isGuest?: boolean;
  onProjectUpdate?: () => void;
}

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  project,
  isGuest,
  onProjectUpdate,
}: ProjectSettingsDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [projectName, setProjectName] = useState(project.name || "");
  const [projectDescription, setProjectDescription] = useState(project.description || "");
  const [projectAddress, setProjectAddress] = useState(project.address || "");
  const [propertyDesignation, setPropertyDesignation] = useState(project.property_designation || "");
  const [startDate, setStartDate] = useState(project.start_date || "");
  const [goalDate, setGoalDate] = useState(project.finish_goal_date || "");
  const [currency, setCurrency] = useState(project.currency || "SEK");
  const [projectStatusValue, setProjectStatusValue] = useState<ProjectStatus>(
    normalizeStatus(project.status)
  );
  const [saving, setSaving] = useState(false);

  const currentStatus = normalizeStatus(project.status);
  const allowedTransitions = ALLOWED_TRANSITIONS[currentStatus];

  useEffect(() => {
    if (open) {
      setProjectName(project.name || "");
      setProjectDescription(project.description || "");
      setProjectAddress(project.address || "");
      setPropertyDesignation(project.property_designation || "");
      setStartDate(project.start_date || "");
      setGoalDate(project.finish_goal_date || "");
      setCurrency(project.currency || "SEK");
      setProjectStatusValue(normalizeStatus(project.status));
    }
  }, [open, project]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isGuest) {
        updateGuestProject(project.id, {
          name: projectName.trim(),
          description: projectDescription.trim() || null,
          address: projectAddress.trim() || null,
          status: projectStatusValue,
          start_date: startDate || null,
        });
      } else {
        const { error } = await supabase
          .from("projects")
          .update({
            name: projectName.trim(),
            description: projectDescription.trim() || null,
            address: projectAddress.trim() || null,
            property_designation: propertyDesignation.trim() || null,
            start_date: startDate || null,
            finish_goal_date: goalDate || null,
            currency,
            status: projectStatusValue,
          })
          .eq("id", project.id);

        if (error) throw error;
      }

      toast({
        title: t("overview.settings.saved"),
        description: t("overview.settings.savedDescription"),
      });
      onProjectUpdate?.();
      onOpenChange(false);
    } catch (error: unknown) {
      toast({
        title: t("common.error"),
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("overview.settings.title")}</DialogTitle>
          <DialogDescription>{t("overview.settings.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t("overview.settings.projectName")}</Label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={t("projects.projectNamePlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("overview.settings.projectDescription")}</Label>
            <Textarea
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              placeholder={t("projects.projectDescriptionPlaceholder")}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("overview.settings.address", "Address")}</Label>
            <Input
              value={projectAddress}
              onChange={(e) => setProjectAddress(e.target.value)}
              placeholder={t("overview.settings.addressPlaceholder", "e.g. Storgatan 5, Stockholm")}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>{t("rot.propertyDesignation")}</Label>
              <span
                className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-muted text-[10px] font-medium text-muted-foreground cursor-help"
                title={t("rot.propertyDesignationRotInfo", "Required for ROT tax deduction applications. Found on your property tax notice (taxeringsbeslut).")}
              >
                ?
              </span>
            </div>
            <Input
              value={propertyDesignation}
              onChange={(e) => setPropertyDesignation(e.target.value)}
              placeholder={t("rot.propertyDesignationPlaceholder")}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("overview.settings.startDate")}</Label>
            <DatePicker
              date={startDate ? parseLocalDate(startDate) : undefined}
              onDateChange={(date) =>
                setStartDate(date ? formatLocalDate(date) : "")
              }
              placeholder={t("overview.selectStartDate")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("overview.settings.goalDate")}</Label>
            <DatePicker
              date={goalDate ? parseLocalDate(goalDate) : undefined}
              onDateChange={(date) =>
                setGoalDate(date ? formatLocalDate(date) : "")
              }
              placeholder={t("overview.selectGoalDate")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("overview.settings.currency")}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          </div>

          <Separator />

          {/* Project status override */}
          <div className="space-y-2">
            <Label>{t("projectStatus.changeStatus", "Change status")}</Label>
            <Select
              value={projectStatusValue}
              onValueChange={(v) => setProjectStatusValue(v as ProjectStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Current status always shown */}
                <SelectItem value={currentStatus}>
                  <span className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${STATUS_META[currentStatus].color.split(" ")[0]}`}
                    />
                    {t(STATUS_META[currentStatus].labelKey)}
                    <span className="text-muted-foreground text-xs ml-1">
                      ({t("common.current", "current")})
                    </span>
                  </span>
                </SelectItem>
                {/* Allowed transitions */}
                {allowedTransitions.map((status) => (
                  <SelectItem key={status} value={status}>
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${STATUS_META[status].color.split(" ")[0]}`}
                      />
                      {t(STATUS_META[status].labelKey)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t(STATUS_META[projectStatusValue].descriptionKey)}
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !projectName.trim()}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
