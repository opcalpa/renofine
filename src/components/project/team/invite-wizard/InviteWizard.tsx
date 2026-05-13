import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { InvitePath } from "./types";
import { useInviteWizard } from "./useInviteWizard";
import { WizardStep1Path } from "./WizardStep1Path";
import { WizardStep2Profession } from "./WizardStep2Profession";

interface InviteWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPath: InvitePath;
  projectId: string;
  onInviteSent?: () => void;
}

export function InviteWizard({
  open,
  onOpenChange,
  initialPath,
  projectId: _projectId,
  onInviteSent: _onInviteSent,
}: InviteWizardProps) {
  const { t } = useTranslation();
  const wizard = useInviteWizard({ initialPath, skipStep1: true });
  const { state, back, next, canAdvance, setPath, setProfession } = wizard;

  const totalSteps = 4;
  const showBack = state.step > 1;
  const isFinal = state.step === totalSteps;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
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
                {t("inviteWizard.title", "Bjud in person")}
              </DialogTitle>
              <DialogDescription>
                {t("inviteWizard.stepIndicator", "Steg {{step}} av {{total}}", {
                  step: state.step,
                  total: totalSteps,
                })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2 min-h-[280px]">
          {state.step === 1 && (
            <WizardStep1Path path={state.path} onChange={setPath} />
          )}
          {state.step === 2 && (
            <WizardStep2Profession
              profession={state.profession}
              onChange={setProfession}
              onSkip={() => {
                setProfession(null);
                next();
              }}
            />
          )}
          {state.step === 3 && (
            <PlaceholderStep
              label={
                state.path === "worker"
                  ? t("inviteWizard.step3WorkerTitle", "Vilka uppgifter och inköpsrättigheter?")
                  : t("inviteWizard.step3MemberTitle", "Vilken nivå av åtkomst?")
              }
            />
          )}
          {state.step === 4 && (
            <PlaceholderStep label={t("inviteWizard.step4Title", "Kontaktuppgifter")} />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          {!isFinal ? (
            <Button type="button" onClick={next} disabled={!canAdvance}>
              {t("common.next", "Nästa")}
            </Button>
          ) : (
            <Button type="button" disabled={!canAdvance}>
              {t("inviteWizard.sendInvite", "Skicka inbjudan")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlaceholderStep({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
