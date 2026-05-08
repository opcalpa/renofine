/**
 * CreateProjectDialog — extracted from Projects.tsx.
 * Multi-step project creation: choose method → fill details → create.
 * Supports: manual, upload (AI extraction), plan renovation, send to client.
 */

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { analytics, AnalyticsEvents } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  ChevronRight,
  ChevronLeft,
  Upload,
  FileText,
  X,
  Loader2,
  Sparkles,
  Mail,
} from "lucide-react";
import {
  saveGuestProject,
  saveGuestRoom,
  saveGuestTask,
  canCreateGuestProject,
} from "@/services/guestStorageService";
import { GUEST_MAX_PROJECTS } from "@/types/guest.types";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isGuest: boolean;
  isContractor: boolean;
  refreshStorageUsage?: () => void;
  onOpenAIImport: () => void;
  onOpenIntake: () => void;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  isGuest,
  isContractor,
  refreshStorageUsage,
  onOpenAIImport,
  onOpenIntake,
}: CreateProjectDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [projectType, setProjectType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [finishDate, setFinishDate] = useState("");
  const [budget, setBudget] = useState("");
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState<"choose" | "upload" | "manual">("choose");
  const [creating, setCreating] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quoteFileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setStep(1);
    setMethod("choose");
    setName("");
    setDescription("");
    setAddress("");
    setPostalCode("");
    setCity("");
    setProjectType("");
    setStartDate("");
    setFinishDate("");
    setBudget("");
    setUploadedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) resetForm();
  };

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      if (isGuest) {
        if (!canCreateGuestProject()) {
          toast({ title: t("common.error"), description: t("guest.projectLimit", "Guest mode is limited to {{max}} projects.", { max: GUEST_MAX_PROJECTS }), variant: "destructive" });
          setCreating(false);
          return;
        }
        const guestProject = saveGuestProject({
          name, description: description || null, status: "planning",
          address: address || null, postal_code: postalCode || null, city: city || null,
          project_type: projectType || null, start_date: startDate || null,
          finish_goal_date: finishDate || null, total_budget: budget ? Number(budget) : null,
        });
        if (!guestProject) throw new Error("Failed to save guest project");
        toast({ title: t("projects.projectCreated"), description: t("projects.projectCreatedDescription") });
        handleOpenChange(false);
        refreshStorageUsage?.();
        navigate(`/projects/${guestProject.id}`);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
      if (!profile) throw new Error("Profile not found");

      const { data, error } = await supabase.from("projects").insert({
        name, description: description || null, owner_id: profile.id,
        address: address || null, postal_code: postalCode || null, city: city || null,
        project_type: projectType || null, start_date: startDate || null,
      }).select().single();
      if (error) throw error;

      // Initial budget entered at creation = homeowner's private cap (RLS owner-only)
      if (budget) {
        await supabase.from("project_private_budget").insert({
          project_id: data.id,
          private_budget_cap: Number(budget),
        });
      }

      analytics.capture(AnalyticsEvents.PROJECT_CREATED, {
        has_description: Boolean(description), has_address: Boolean(address),
        has_budget: Boolean(budget), has_start_date: Boolean(startDate),
        project_type: projectType || "none",
      });

      toast({ title: t("projects.projectCreated"), description: t("projects.projectCreatedDescription") });
      handleOpenChange(false);
      navigate(`/projects/${data.id}`);
    } catch (error: unknown) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleQuickPlan = async () => {
    if (isGuest) {
      if (!canCreateGuestProject()) {
        toast({ title: t("common.error"), description: t("guest.projectLimit", "Guest mode is limited to {{max}} projects.", { max: GUEST_MAX_PROJECTS }), variant: "destructive" });
        return;
      }
      const guestProject = saveGuestProject({
        name: t("projects.defaultProjectName", "My renovation"),
        description: null, status: "planning", address: null, postal_code: null,
        city: null, project_type: null, start_date: null, finish_goal_date: null, total_budget: null,
      });
      if (guestProject) {
        handleOpenChange(false);
        refreshStorageUsage?.();
        navigate(`/projects/${guestProject.id}`);
      }
    } else {
      setCreating(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
        if (!profile) throw new Error("Profile not found");
        const { data, error } = await supabase.from("projects").insert({
          name: t("projects.defaultProjectName", "My renovation"), owner_id: profile.id, status: "planning",
        }).select("id").single();
        if (error) throw error;
        handleOpenChange(false);
        navigate(`/projects/${data.id}`);
      } catch (err) {
        toast({ title: t("common.error"), description: (err as Error).message, variant: "destructive" });
      } finally {
        setCreating(false);
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: t("common.error"), description: t("pipeline.quickQuote.fileTooLarge"), variant: "destructive" });
      return;
    }
    if (isGuest) {
      return handleGuestAIUpload(file);
    }
    setUploadedFile(file);
    setExtracting(true);
    try {
      if (file.type === "text/plain") {
        const text = await file.text();
        setDescription((prev) => prev ? `${prev}\n\n${text}` : text);
        toast({ title: t("pipeline.quickQuote.textExtracted") });
      } else if (file.type === "application/pdf" || file.type.startsWith("image/")) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(file);
        });
        const { data, error } = await supabase.functions.invoke("extract-document-text", {
          body: { fileBase64: base64, mimeType: file.type, fileName: file.name },
        });
        if (error) {
          toast({ title: t("pipeline.quickQuote.extractionFailed"), variant: "destructive" });
        } else if (data?.text) {
          setDescription((prev) => prev ? `${prev}\n\n${data.text}` : data.text);
          if (!name.trim()) setName(file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
          toast({ title: t("pipeline.quickQuote.textExtracted") });
        } else {
          toast({ title: t("pipeline.quickQuote.noTextFound"), variant: "destructive" });
        }
      } else {
        toast({ title: t("pipeline.quickQuote.unsupportedFileType"), variant: "destructive" });
        setUploadedFile(null);
      }
    } catch {
      toast({ title: t("pipeline.quickQuote.extractionFailed"), variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const handleGuestAIUpload = async (file: File) => {
    setExtracting(true);
    try {
      if (!canCreateGuestProject()) {
        toast({ title: t("common.error"), description: t("guest.projectLimit", "Guest mode is limited to {{max}} projects.", { max: GUEST_MAX_PROJECTS }), variant: "destructive" });
        return;
      }
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/process-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseAnonKey}`, "apikey": supabaseAnonKey },
        body: JSON.stringify({ fileBase64: base64, mimeType: file.type, fileName: file.name }),
      });
      if (!response.ok) throw new Error(`Edge function error: ${response.status}`);
      const result = await response.json();
      if (result.error) throw new Error(result.error);

      const rooms = (result.rooms || []).filter((r: { confidence: number }) => r.confidence >= 0.7);
      const tasks = (result.tasks || []).filter((t: { confidence: number }) => t.confidence >= 0.7);
      const suggestedName = result.documentSummary ? result.documentSummary.substring(0, 60) : file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      const guestProject = saveGuestProject({
        name: suggestedName || t("projects.defaultGuestProjectName", "My renovation"),
        description: result.documentSummary || null, status: "planning",
        address: null, postal_code: null, city: null, project_type: null,
        start_date: null, finish_goal_date: null, total_budget: null,
      });
      if (!guestProject) throw new Error("Failed to save guest project");

      const roomNameToId: Record<string, string> = {};
      for (const room of rooms) {
        const savedRoom = saveGuestRoom(guestProject.id, {
          name: room.name, room_type: null, status: "existing",
          area_sqm: room.estimatedAreaSqm || null, floor_number: null,
          notes: room.description || null, width_mm: null, height_mm: null, ceiling_height_mm: null,
        });
        if (savedRoom) roomNameToId[room.name.toLowerCase()] = savedRoom.id;
      }
      for (const task of tasks) {
        const roomId = task.roomName ? roomNameToId[task.roomName.toLowerCase()] || null : null;
        saveGuestTask(guestProject.id, {
          room_id: roomId, title: task.title, description: task.description || null,
          status: "to_do", priority: null, due_date: null,
        });
      }

      handleOpenChange(false);
      refreshStorageUsage?.();
      navigate(`/projects/${guestProject.id}`);
      toast({
        title: t("projects.aiImportSuccess", "Document analyzed"),
        description: t("projects.aiImportSuccessDesc", "{{tasks}} tasks and {{rooms}} rooms extracted", { tasks: tasks.length, rooms: rooms.length }),
      });
    } catch (err) {
      console.error("Guest AI upload error:", err);
      toast({ title: t("common.error"), description: (err as Error).message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  /**
   * Quote-mode AI upload for AUTHENTICATED users.
   * Extracts rooms + tasks + budget metadata via process-document(mode="quote"),
   * then creates project, rooms, tasks, and private_budget_cap in one shot.
   */
  const handleAuthQuoteUpload = async (file: File) => {
    setExtracting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
      if (!profile) throw new Error("Profile not found");

      // 1. Extract via process-document mode=quote
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });
      const { data: result, error: fnError } = await supabase.functions.invoke("process-document", {
        body: { fileBase64: base64, mimeType: file.type, fileName: file.name, mode: "quote" },
      });
      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);

      const rooms = (result.rooms || []).filter((r: { confidence: number }) => r.confidence >= 0.7);
      const tasks = (result.tasks || []).filter((t: { confidence: number }) => t.confidence >= 0.5);
      const meta = result.quoteMetadata || {};
      const suggestedName = meta.vendorName
        ? `Renovering — ${meta.vendorName}`
        : (result.documentSummary?.substring(0, 60) || file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));

      // 2. Create project
      const { data: project, error: projErr } = await supabase.from("projects").insert({
        name: suggestedName,
        description: result.documentSummary || null,
        owner_id: profile.id,
      }).select().single();
      if (projErr) throw projErr;

      // 3. Private budget cap from quote total (if present)
      if (meta.totalAmount && Number(meta.totalAmount) > 0) {
        await supabase.from("project_private_budget").insert({
          project_id: project.id,
          private_budget_cap: Number(meta.totalAmount),
        });
      }

      // 4. Create rooms — keep name→id map for task linking
      const roomNameToId: Record<string, string> = {};
      for (const room of rooms) {
        const { data: savedRoom } = await supabase.from("rooms").insert({
          project_id: project.id,
          name: room.name,
          notes: room.description || null,
          dimensions: room.estimatedAreaSqm ? { estimatedAreaSqm: room.estimatedAreaSqm } : null,
        }).select("id").single();
        if (savedRoom) roomNameToId[room.name.toLowerCase()] = savedRoom.id;
      }

      // 5. Create tasks linked to rooms by name
      for (const task of tasks) {
        const roomId = task.roomName ? roomNameToId[task.roomName.toLowerCase()] || null : null;
        await supabase.from("tasks").insert({
          project_id: project.id,
          room_id: roomId,
          title: task.title,
          description: task.description || null,
          status: "to_do",
          subcontractor_cost: task.estimatedCost || task.laborCost || null,
          material_estimate: task.materialCost || null,
          rot_eligible: task.rotEligible ?? null,
          rot_amount: task.rotAmount || null,
          is_ata: false,
          created_by_user_id: profile.id,
        });
      }

      analytics.capture(AnalyticsEvents.PROJECT_CREATED, {
        method: "ai_quote_upload",
        rooms_extracted: rooms.length,
        tasks_extracted: tasks.length,
        has_budget: !!meta.totalAmount,
      });

      handleOpenChange(false);
      navigate(`/projects/${project.id}`);
      toast({
        title: t("projects.aiImportSuccess", "Document analyzed"),
        description: t("projects.aiImportSuccessDesc", "{{tasks}} tasks and {{rooms}} rooms extracted", { tasks: tasks.length, rooms: rooms.length }),
      });
    } catch (err) {
      console.error("Quote AI upload error:", err);
      toast({ title: t("common.error"), description: (err as Error).message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={method === "choose" ? "sm:max-w-lg" : undefined}>
        <DialogHeader>
          <DialogTitle>{t("projects.newProject")}</DialogTitle>
          <DialogDescription>
            {method === "choose"
              ? t("projects.chooseMethodDescription", "Choose how you want to create your project")
              : t("projects.createProjectDescription")}
          </DialogDescription>
        </DialogHeader>

        {/* Step 0: Choose creation method */}
        {method === "choose" && (
          <div className="flex flex-col gap-3 py-2">
            {/* Hidden quote file picker — drives handleAuthQuoteUpload / handleGuestAIUpload */}
            <input
              ref={quoteFileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                e.target.value = "";
                if (isGuest) handleGuestAIUpload(file);
                else handleAuthQuoteUpload(file);
              }}
            />

            <button type="button"
              onClick={() => quoteFileInputRef.current?.click()}
              disabled={extracting}
              className="flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left hover:border-primary/50 hover:bg-accent/50 active:scale-[0.98] border-purple-300 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/40 dark:to-purple-900/20 disabled:opacity-50">
              <div className="h-12 w-12 rounded-full bg-purple-200 dark:bg-purple-800/50 flex items-center justify-center flex-shrink-0">
                {extracting ? (
                  <Loader2 className="h-6 w-6 text-purple-700 dark:text-purple-300 animate-spin" />
                ) : (
                  <Sparkles className="h-6 w-6 text-purple-700 dark:text-purple-300" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium text-base">
                  {extracting
                    ? t("projects.methodQuoteAnalyzing", "Analyserar offert…")
                    : t("projects.methodQuote", "Ladda upp offert")}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t("projects.methodQuoteDesc", "AI extraherar arbeten, rum och budget från en PDF-offert")}
                </p>
              </div>
            </button>

            <button type="button" onClick={() => { handleOpenChange(false); setTimeout(onOpenAIImport, 150); }}
              className="flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left hover:border-primary/50 hover:bg-accent/50 active:scale-[0.98] border-border">
              <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-base">{t("projects.methodUpload", "Upload description")}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{t("projects.methodUploadDesc", "Let AI extract project details from a document")}</p>
              </div>
            </button>

            <button type="button" onClick={handleQuickPlan}
              className="flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left hover:border-primary/50 hover:bg-accent/50 active:scale-[0.98] border-primary/20 bg-primary/5">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Plus className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-base">{t("projects.methodPlanRenovation", "Plan your renovation")}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{t("projects.methodPlanRenovationDesc", "Describe what you want to do — we help you structure it")}</p>
              </div>
            </button>

            {isContractor && !isGuest && (
              <button type="button" onClick={() => { handleOpenChange(false); setTimeout(onOpenIntake, 150); }}
                className="flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left hover:border-primary/50 hover:bg-accent/50 active:scale-[0.98] border-border">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Mail className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-base">{t("projects.methodSendToClient", "Send to client")}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{t("projects.methodSendToClientDesc", "Send a form to your client to fill in project details")}</p>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Form for upload or manual method */}
        {method !== "choose" && (
          <form onSubmit={handleCreate} className="space-y-4">
            {step === 1 ? (
              <>
                {method === "upload" && (
                  <>
                    <input ref={fileInputRef} type="file" accept=".txt,.pdf,image/*" onChange={handleFileSelect} className="hidden" />
                    {!uploadedFile && !extracting ? (
                      <div className="flex flex-col items-center justify-center py-8 space-y-4">
                        <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-4">
                          <Sparkles className="h-8 w-8 text-purple-500" />
                        </div>
                        <div className="text-center space-y-1">
                          <p className="font-medium">{t("projects.aiImportTitle", "Upload document")}</p>
                          <p className="text-sm text-muted-foreground max-w-sm">{t("projects.aiImportHint", "Upload a quote request, description, or other document to auto-fill the form.")}</p>
                        </div>
                        <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => fileInputRef.current?.click()}>
                          <Upload className="h-4 w-4 mr-2" />
                          {t("projects.selectFile", "Select file")}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setMethod("choose")}>
                          <ChevronLeft className="h-3 w-3 mr-1" />
                          {t("projects.back")}
                        </Button>
                      </div>
                    ) : extracting ? (
                      <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="h-10 w-10 animate-spin text-purple-500 mb-4" />
                        <p className="font-medium">{t("aiDocumentImport.analyzing", "Analyzing document...")}</p>
                        <p className="text-sm text-muted-foreground mt-1">{t("aiDocumentImport.analyzingTime", "This takes 10-30 seconds")}</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate flex-1">{uploadedFile?.name}</span>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setUploadedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <FormFields name={name} setName={setName} address={address} setAddress={setAddress} postalCode={postalCode} setPostalCode={setPostalCode} city={city} setCity={setCity} description={description} setDescription={setDescription} t={t} />
                        <StepButtons onBack={() => setMethod("choose")} onNext={() => setStep(2)} canNext={!!name.trim()} creating={creating} t={t} />
                      </>
                    )}
                  </>
                )}
                {method === "manual" && (
                  <>
                    <FormFields name={name} setName={setName} address={address} setAddress={setAddress} postalCode={postalCode} setPostalCode={setPostalCode} city={city} setCity={setCity} description={description} setDescription={setDescription} t={t} />
                    <StepButtons onBack={() => setMethod("choose")} onNext={() => setStep(2)} canNext={!!name.trim()} creating={creating} t={t} />
                  </>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t("projects.startDate")}</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("projects.goalDate", "Goal date")}</Label>
                    <Input type="date" value={finishDate} onChange={(e) => setFinishDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("projects.totalBudget")}</Label>
                  <Input type="number" placeholder="0 kr" value={budget} onChange={(e) => setBudget(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    {t("projects.back")}
                  </Button>
                  <Button type="submit" className="flex-1" disabled={creating}>
                    {creating ? t("projects.creating") : t("projects.createProject")}
                  </Button>
                </div>
              </>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------------------------
// Shared sub-components (avoid JSX duplication)
// -------------------------------------------------------------------------

function FormFields({ name, setName, address, setAddress, postalCode, setPostalCode, city, setCity, description, setDescription, t }: {
  name: string; setName: (v: string) => void;
  address: string; setAddress: (v: string) => void;
  postalCode: string; setPostalCode: (v: string) => void;
  city: string; setCity: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  t: (key: string, fallback?: string) => string;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="cp-name">{t("projects.projectName")} *</Label>
        <Input id="cp-name" placeholder={t("projects.projectNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cp-address">{t("projects.address")}</Label>
        <Input id="cp-address" placeholder={t("projects.addressPlaceholder")} value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="cp-postal">{t("projects.postalCode")}</Label>
          <Input id="cp-postal" placeholder="123 45" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cp-city">{t("projects.city")}</Label>
          <Input id="cp-city" placeholder={t("projects.cityPlaceholder")} value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cp-desc">{t("projects.projectDescription")}</Label>
        <Textarea id="cp-desc" placeholder={t("projects.projectDescriptionPlaceholder")} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
    </>
  );
}

function StepButtons({ onBack, onNext, canNext, creating, t }: {
  onBack: () => void; onNext: () => void; canNext: boolean; creating: boolean;
  t: (key: string, fallback?: string) => string;
}) {
  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" onClick={onBack}>
        <ChevronLeft className="h-4 w-4 mr-1" />
        {t("projects.back")}
      </Button>
      <Button type="button" className="flex-1" onClick={onNext} disabled={!canNext}>
        {t("projects.next")}
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
      <Button type="submit" variant="ghost" disabled={creating || !canNext}>
        {creating ? t("projects.creating") : t("projects.skipAndCreate")}
      </Button>
    </div>
  );
}
