import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * Promise-based confirm backed by the app's AlertDialog, replacing native
 * window.confirm(). Native confirm() blocks the renderer synchronously — it
 * can't be dismissed by browser automation (appears as a "freeze"/CDP timeout)
 * and behaves unreliably inside the installed PWA. Near drop-in:
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (!(await confirm({ title, description, destructive: true }))) return;
 *   // ...render {confirmDialog} once in the component tree
 */
export function useConfirm() {
  const { t } = useTranslation();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setOpts(options);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  const confirmDialog = (
    <AlertDialog open={opts !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
      {opts && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts.title}</AlertDialogTitle>
            {opts.description && (
              <AlertDialogDescription>{opts.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {opts.cancelLabel ?? t("common.cancel", "Avbryt")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={cn(opts.destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            >
              {opts.confirmLabel ?? t("common.confirm", "Bekräfta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );

  return { confirm, confirmDialog };
}
