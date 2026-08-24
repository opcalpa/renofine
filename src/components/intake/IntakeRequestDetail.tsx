import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { sv, enUS } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import {
  User,
  Mail,
  Phone,
  MapPin,
  Home,
  Calendar,
  Clock,
  Copy,
  FileText,
  XCircle,
  Loader2,
  Check,
  Wrench,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { linkNewProjectToProperty } from "@/services/propertyService";
import {
  cancelIntakeRequest,
  getIntakeFormUrl,
  createRoomsFromIntake,
  createTasksFromIntake,
  createClientFromIntake,
  markIntakeAsConverted,
  type IntakeRequest,
  type IntakeStatus,
} from "@/services/intakeService";

interface IntakeRequestDetailProps {
  request: IntakeRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (request: IntakeRequest) => void;
  onDeleted: () => void;
}

const STATUS_CONFIG: Record<
  IntakeStatus,
  { labelKey: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { labelKey: "intake.statusPending", variant: "outline" },
  submitted: { labelKey: "intake.statusSubmitted", variant: "default" },
  converted: { labelKey: "intake.statusConverted", variant: "secondary" },
  expired: { labelKey: "intake.statusExpired", variant: "destructive" },
  cancelled: { labelKey: "intake.statusCancelled", variant: "destructive" },
};

export function IntakeRequestDetail({
  request,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
}: IntakeRequestDetailProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.language === "sv" ? sv : enUS;

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [converting, setConverting] = useState(false);
  const [copied, setCopied] = useState(false);

  const statusConfig = STATUS_CONFIG[request.status];
  const formUrl = getIntakeFormUrl(request.token);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(formUrl);
    setCopied(true);
    toast.success(t("intake.linkCopied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelIntakeRequest(request.id);
      onUpdated({ ...request, status: "cancelled" });
      toast.success(t("common.success"));
      setCancelDialogOpen(false);
    } catch (error) {
      console.error("Failed to cancel request:", error);
      toast.error(t("common.error"));
    } finally {
      setCancelling(false);
    }
  };

  const handleConvertToQuote = async () => {
    if (converting) return;

    setConverting(true);
    try {
      // 1. Get current user's profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      // 2. Create or find client
      let clientId: string | undefined;
      if (request.customer_email) {
        clientId = await createClientFromIntake(profile.id, {
          name: request.customer_name || request.customer_email,
          email: request.customer_email,
          phone: request.customer_phone || undefined,
          address: request.property_address || undefined,
          postal_code: request.property_postal_code || undefined,
          city: request.property_city || undefined,
        });
      }

      // 3. Create project
      const projectName = request.property_address
        ? `${request.customer_name || "Kund"} - ${request.property_address}`
        : `${request.customer_name || "Kund"} - Renovering`;

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
          owner_id: profile.id,
          name: projectName,
          address: request.property_address,
          postal_code: request.property_postal_code,
          city: request.property_city,
          project_type: request.property_type,
          description: request.project_description,
          status: "planning",
        })
        .select("id")
        .single();

      if (projectError) throw projectError;

      await linkNewProjectToProperty(project.id, {
        ownerProfileId: profile.id,
        address: request.property_address,
        postalCode: request.property_postal_code,
        city: request.property_city,
        fallbackName: projectName,
      });

      // 4. Create rooms from intake data
      const roomMapping = await createRoomsFromIntake(
        project.id,
        request.rooms_data || []
      );

      // 5. Create tasks from intake data
      await createTasksFromIntake(
        project.id,
        request.rooms_data || [],
        roomMapping,
        profile.id
      );

      // 6. Mark intake as converted
      await markIntakeAsConverted(request.id, project.id, clientId);

      // 7. Generate quote items from rooms_data
      const quoteItems: {
        description: string;
        quantity: number;
        unit: string;
        estimatedPrice: number;
        isLabor: boolean;
        roomName: string;
      }[] = [];

      if (request.rooms_data && request.rooms_data.length > 0) {
        for (const room of request.rooms_data) {
          for (const workType of room.work_types) {
            quoteItems.push({
              description: `${room.name} - ${t(`intake.workType.${workType}`)}`,
              quantity: 1,
              unit: "st",
              estimatedPrice: 0, // User needs to fill in price
              isLabor: true, // All work types are labor
              roomName: room.name,
            });
          }
        }
      }

      // Store quote items for CreateQuote to pick up
      if (quoteItems.length > 0) {
        sessionStorage.setItem("intakeQuoteItems", JSON.stringify(quoteItems));
      }

      // 8. Update local state
      onUpdated({
        ...request,
        status: "converted",
        project_id: project.id,
        client_id: clientId || null,
      });

      toast.success(t("intake.converted"), {
        description: t("intake.convertedDescription"),
      });

      // 9. Navigate to create quote with prepopulated items
      onOpenChange(false);
      const params = new URLSearchParams({ projectId: project.id });
      if (clientId) {
        params.set("clientId", clientId);
      }
      if (quoteItems.length > 0) {
        params.set("fromIntake", "true");
      }
      navigate(`/quotes/new?${params.toString()}`);
    } catch (error) {
      console.error("Failed to convert intake to quote:", error);
      toast.error(t("common.error"));
    } finally {
      setConverting(false);
    }
  };

  const propertyTypeLabel = request.property_type
    ? t(`intake.${request.property_type}`)
    : null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center gap-2">
              <Badge variant={statusConfig.variant}>
                {t(statusConfig.labelKey)}
              </Badge>
            </div>
            <SheetTitle>
              {request.customer_name || request.customer_email || t("intake.statusPending")}
            </SheetTitle>
            <SheetDescription>
              {request.submitted_at
                ? `${t("intake.statusSubmitted")} ${format(
                    new Date(request.submitted_at),
                    "PPp",
                    { locale }
                  )}`
                : `${t("common.created")} ${format(
                    new Date(request.created_at),
                    "PPp",
                    { locale }
                  )}`}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            {/* Actions for pending */}
            {request.status === "pending" && (
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {t("intake.sendLinkDescription")}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 gap-2"
                        onClick={handleCopyLink}
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        {t("intake.copyLink")}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => window.open(formUrl, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Actions for submitted */}
            {request.status === "submitted" && (
              <Button
                className="w-full gap-2"
                onClick={handleConvertToQuote}
                disabled={converting}
              >
                {converting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("intake.converting")}
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    {t("intake.convertToQuote")}
                  </>
                )}
              </Button>
            )}

            {/* Contact info */}
            {(request.customer_name || request.customer_email || request.customer_phone) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {t("intake.yourDetails")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {request.customer_name && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{request.customer_name}</span>
                    </div>
                  )}
                  {request.customer_email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={`mailto:${request.customer_email}`}
                        className="text-primary hover:underline"
                      >
                        {request.customer_email}
                      </a>
                    </div>
                  )}
                  {request.customer_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={`tel:${request.customer_phone}`}
                        className="text-primary hover:underline"
                      >
                        {request.customer_phone}
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Property info */}
            {request.property_address && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {t("intake.theProperty")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>{request.property_address}</p>
                  {(request.property_postal_code || request.property_city) && (
                    <p className="text-muted-foreground">
                      {[request.property_postal_code, request.property_city]
                        .filter(Boolean)
                        .join(" ")}
                    </p>
                  )}
                  {propertyTypeLabel && (
                    <Badge variant="outline" className="mt-2">
                      <Home className="h-3 w-3 mr-1" />
                      {propertyTypeLabel}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Rooms */}
            {request.rooms_data && request.rooms_data.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    {t("intake.roomsToRenovate")} ({request.rooms_data.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {request.rooms_data.map((room, index) => (
                    <div
                      key={room.id}
                      className={index > 0 ? "pt-4 border-t" : ""}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium">{room.name}</span>
                        <Badge
                          variant={
                            room.priority === "high"
                              ? "destructive"
                              : room.priority === "low"
                              ? "secondary"
                              : "outline"
                          }
                          className="text-xs"
                        >
                          {t(
                            `intake.priority${
                              room.priority.charAt(0).toUpperCase() +
                              room.priority.slice(1)
                            }`
                          )}
                        </Badge>
                      </div>
                      {room.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {room.description}
                        </p>
                      )}
                      {room.work_types.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {room.work_types.map((wt) => (
                            <Badge key={wt} variant="secondary" className="text-xs">
                              {t(`intake.workType.${wt}`)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Project description */}
            {request.project_description && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    {t("intake.additionalComments")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {request.project_description}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Danger zone */}
            {request.status === "pending" && (
              <>
                <Separator />
                <Button
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive gap-2"
                  onClick={() => setCancelDialogOpen(true)}
                >
                  <XCircle className="h-4 w-4" />
                  {t("intake.cancel")}
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Cancel confirmation */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("intake.cancel")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("intake.cancelConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? t("common.loading") : t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
