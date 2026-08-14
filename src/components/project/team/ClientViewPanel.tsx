import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Eye, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CustomerViewTab from "@/components/project/CustomerViewTab";

interface ClientViewPanelProps {
  projectId: string;
  clientName: string;
}

/**
 * Per-client "see exactly what the client sees" preview in the expanded Team
 * row — the client-persona analog of WorkerActivityPanel's worker preview.
 * Renders the real CustomerViewTab (the exact masked client surface) in a
 * dialog so the owner can verify what an invited client is shown rather than
 * trusting the persona description. Trust epic: owner confidence = seeing what
 * the counterpart sees. Project fields are fetched lazily on first open.
 */
export function ClientViewPanel({ projectId, clientName }: ClientViewPanelProps) {
  const { t } = useTranslation();
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: project, isLoading } = useQuery({
    queryKey: ["client-preview-project", projectId],
    enabled: previewOpen,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, name, start_date, finish_goal_date, currency, address, description, status, contract_value, cover_image_url",
        )
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const title = t("clientPreview.seeWhatTheySee", "Se exakt vad {{name}} ser", { name: clientName });

  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t("clientPreview.title", "Kundvy")}</p>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setPreviewOpen(true)}>
          <Eye className="h-3.5 w-3.5" />
          {title}
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {t("clientPreview.hint", "Förhandsgranska den maskade kundvyn – utan interna priser eller påslag.")}
      </p>

      {previewOpen && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent size="6xl" className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            {isLoading || !project ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("common.loading", "Laddar…")}
              </div>
            ) : (
              <CustomerViewTab
                projectId={project.id}
                projectName={project.name}
                projectStartDate={project.start_date}
                projectFinishDate={project.finish_goal_date}
                currency={project.currency}
                address={project.address}
                description={project.description}
                status={project.status}
                contractValue={project.contract_value}
                coverImageUrl={project.cover_image_url}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
