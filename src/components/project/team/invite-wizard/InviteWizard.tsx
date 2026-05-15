import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Copy, Loader2, MessageCircle, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { InvitePath } from "./types";
import { useInviteWizard, type WorkerPrefill } from "./useInviteWizard";
import { WizardStep1Path } from "./WizardStep1Path";
import { WizardStep3Worker } from "./WizardStep3Worker";
import { WizardStep3Member } from "./WizardStep3Member";
import { WizardStep4Contact } from "./WizardStep4Contact";
import {
  submitInvite,
  DuplicateContactError,
  type SubmitResult,
  type WorkerSubmitResult,
} from "./submitInvite";

interface InviteWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPath: InvitePath;
  projectId: string;
  /** Existing active member emails — lowercased. Used for dup-check. */
  existingMemberEmails?: string[];
  /** Existing pending invitation emails — lowercased. Used for dup-check. */
  existingInvitationEmails?: string[];
  /** Existing active worker contacts. */
  existingWorkerContacts?: { emails: string[]; phones: string[] };
  /** Optional pre-fill for worker reinvite. */
  prefillWorker?: WorkerPrefill;
  onInviteSent?: () => void;
}

export function InviteWizard({
  open,
  onOpenChange,
  initialPath,
  projectId,
  existingMemberEmails = [],
  existingInvitationEmails = [],
  existingWorkerContacts = { emails: [], phones: [] },
  prefillWorker,
  onInviteSent,
}: InviteWizardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const wizard = useInviteWizard({ initialPath, skipStep1: true, prefillWorker });
  const {
    state,
    back,
    next,
    canAdvance,
    setPath,
    setProfession,
    setWorkerAccess,
    toggleWorkerTask,
    setWorkerOverride,
    toggleChecklistItem,
    isChecklistItemIncluded,
    addInstructionImage,
    updateInstructionImage,
    removeInstructionImage,
    setPackagePreset,
    setOnlyAssigned,
    setAccessField,
    resetToPackage,
    setContact,
  } = wizard;

  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);

  // Reset success-state when the dialog reopens so a previous run does not bleed through.
  useEffect(() => {
    if (open) setSubmitResult(null);
  }, [open]);

  const totalSteps = 3;
  const showBack = state.step > 1 && !submitResult;
  const isFinal = state.step === totalSteps;
  const showSuccessScreen = submitResult !== null;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const result = await submitInvite(state, {
        projectId,
        existingMemberEmails: new Set(existingMemberEmails),
        existingInvitationEmails: new Set(existingInvitationEmails),
        existingWorkerContacts: {
          emails: new Set(existingWorkerContacts.emails),
          phones: new Set(existingWorkerContacts.phones),
        },
      });

      setSubmitResult(result);
      onInviteSent?.();

      if (result.kind === "member") {
        toast({
          title: result.emailSendFailed
            ? t("inviteWizard.toast.memberCreatedEmailFailed", "Inbjudan skapad — e-post kunde inte skickas")
            : t("inviteWizard.toast.memberSent", "Inbjudan skickad"),
          description: result.emailSendFailed
            ? t(
                "inviteWizard.toast.memberCreatedEmailFailedDescription",
                "Vi sparade inbjudan men kunde inte skicka e-postnotifieringen.",
              )
            : t(
                "inviteWizard.toast.memberSentDescription",
                "Personen får ett e-postmeddelande inom kort.",
              ),
          variant: result.emailSendFailed ? "destructive" : undefined,
        });
        // Member-flödet stänger automatiskt — det finns inget länk-state att visa
        setTimeout(() => onOpenChange(false), 1500);
      }
      // Worker-flödet visar success-screen med länken; user stänger själv.
    } catch (err) {
      if (err instanceof DuplicateContactError) {
        toast({
          title: t("inviteWizard.toast.duplicate", "Personen finns redan i teamet"),
          description: err.message,
          variant: "destructive",
        });
      } else {
        console.error("Invite submit failed:", err);
        toast({
          title: t("common.error", "Något gick fel"),
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const wideLayout =
    !showSuccessScreen && state.step === 2 && state.path === "worker";

  return (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) setSubmitResult(null);
    }}>
      <DialogContent
        className={
          wideLayout
            ? "w-[95vw] md:!max-w-[90vw] lg:!max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
            : "max-w-2xl"
        }
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            {showBack && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={back}
                aria-label={t("common.back", "Tillbaka")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1">
              <DialogTitle>
                {showSuccessScreen
                  ? t("inviteWizard.titleSuccess", "Inbjudan skapad")
                  : t("inviteWizard.title", "Bjud in person")}
              </DialogTitle>
              <DialogDescription>
                {showSuccessScreen
                  ? null
                  : t("inviteWizard.stepIndicator", "Steg {{step}} av {{total}}", {
                      step: state.step,
                      total: totalSteps,
                    })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2 min-h-[280px]">
          {showSuccessScreen && submitResult.kind === "worker" && (
            <WorkerSuccess
              result={submitResult}
              phone={state.contact.phone.trim()}
              email={state.contact.email.trim()}
            />
          )}

          {!showSuccessScreen && (
            <>
              {state.step === 1 && (
                <WizardStep1Path path={state.path} onChange={setPath} />
              )}
              {state.step === 2 && state.path === "worker" && (
                <WizardStep3Worker
                  projectId={projectId}
                  workerAccess={state.workerAccess}
                  onToggleTask={toggleWorkerTask}
                  onChange={setWorkerAccess}
                  onSetOverride={setWorkerOverride}
                  onToggleChecklistItem={toggleChecklistItem}
                  isChecklistItemIncluded={isChecklistItemIncluded}
                  onAddInstructionImage={addInstructionImage}
                  onUpdateInstructionImage={updateInstructionImage}
                  onRemoveInstructionImage={removeInstructionImage}
                />
              )}
              {state.step === 2 && state.path === "member" && (
                <WizardStep3Member
                  memberAccess={state.memberAccess}
                  profession={state.profession}
                  onSetProfession={setProfession}
                  onSetPreset={setPackagePreset}
                  onSetOnlyAssigned={setOnlyAssigned}
                  onSetAccessField={setAccessField}
                  onResetToPackage={resetToPackage}
                />
              )}
              {state.step === 3 && (
                <WizardStep4Contact
                  path={state.path}
                  contact={state.contact}
                  onChange={setContact}
                />
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          {showSuccessScreen ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t("common.close", "Stäng")}
            </Button>
          ) : !isFinal ? (
            <Button type="button" onClick={next} disabled={!canAdvance}>
              {t("common.next", "Nästa")}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canAdvance || submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("inviteWizard.sendInvite", "Skicka inbjudan")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface WorkerSuccessProps {
  result: WorkerSubmitResult;
  phone: string;
  email: string;
}

function WorkerSuccess({ result, phone, email }: WorkerSuccessProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(result.workerLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const sendSms = async () => {
    try {
      const { data, error } = await import("@/integrations/supabase/client").then(
        ({ supabase }) =>
          supabase.functions.invoke("send-worker-sms", {
            body: { tokenId: result.tokenId },
          }),
      );
      if (error) throw error;
      toast({
        title: t("inviteWizard.success.smsSent", "SMS skickat"),
        description: (data as { phone?: string })?.phone || phone,
      });
    } catch (err) {
      toast({
        title: t("common.error", "Något gick fel"),
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const sendEmail = async () => {
    try {
      const { data, error } = await import("@/integrations/supabase/client").then(
        ({ supabase }) =>
          supabase.functions.invoke("send-worker-email", {
            body: { tokenId: result.tokenId },
          }),
      );
      if (error) throw error;
      toast({
        title: t("inviteWizard.success.emailSent", "E-post skickat"),
        description: (data as { email?: string })?.email || email,
      });
    } catch {
      // Fallback to mailto
      const body = encodeURIComponent(result.workerLink);
      window.location.href = `mailto:${email}?body=${body}`;
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-emerald-50 dark:bg-emerald-950/30 p-3 text-emerald-900 dark:text-emerald-200">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Check className="h-4 w-4" />
          {t(
            "inviteWizard.success.workerHeader",
            "Länken är klar — dela den med arbetaren.",
          )}
        </div>
      </div>

      <div className="rounded-md border p-3 bg-muted/30">
        <p className="font-mono text-xs break-all select-all">{result.workerLink}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-1.5" />
              {t("inviteWizard.success.copied", "Kopierad")}
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-1.5" />
              {t("inviteWizard.success.copyLink", "Kopiera länk")}
            </>
          )}
        </Button>
        {phone && (
          <Button type="button" variant="outline" size="sm" onClick={sendSms}>
            <MessageCircle className="h-4 w-4 mr-1.5" />
            {t("inviteWizard.success.sendSms", "Skicka SMS")}
          </Button>
        )}
        {email && (
          <Button type="button" variant="outline" size="sm" onClick={sendEmail}>
            <Mail className="h-4 w-4 mr-1.5" />
            {t("inviteWizard.success.sendEmail", "Skicka e-post")}
          </Button>
        )}
      </div>
    </div>
  );
}
