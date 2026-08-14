import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Wrench, Send, ArrowRight } from "lucide-react";

interface StartProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartSelf: () => void;
  onSendRfq: () => void;
}

export function StartProjectModal({ open, onOpenChange, onStartSelf, onSendRfq }: StartProjectModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="px-6 sm:px-0">
          <DialogTitle>{t("startProject.title", "How do you want to proceed?")}</DialogTitle>
          <DialogDescription className="max-w-[46ch] mx-auto sm:mx-0">
            {t("startProject.description", "Choose how to move forward with your renovation project.")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 pt-2">
          <button
            onClick={() => { onOpenChange(false); onStartSelf(); }}
            className="flex items-start gap-4 p-4 rounded-xl border-2 border-transparent bg-emerald-50 dark:bg-emerald-950/20 hover:border-emerald-300 transition-all text-left group"
          >
            <div className="h-11 w-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-emerald-200 transition-colors">
              <Wrench className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{t("startProject.selfManage", "Manage it yourself")}</p>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("startProject.selfManageDesc", "Start the project and invite contractors to collaborate on tasks, timeline and budget.")}
              </p>
            </div>
          </button>

          <button
            onClick={() => { onOpenChange(false); onSendRfq(); }}
            className="flex items-start gap-4 p-4 rounded-xl border-2 border-transparent bg-blue-50 dark:bg-blue-950/20 hover:border-blue-300 transition-all text-left group"
          >
            <div className="h-11 w-11 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-blue-200 transition-colors">
              <Send className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{t("startProject.sendRfq", "Get quotes first")}</p>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("startProject.sendRfqDesc", "Share your renovation plan with builders and compare price estimates before starting.")}
              </p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
