import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, AlertCircle, Loader2, Clock } from "lucide-react";

interface AtaData {
  taskTitle: string;
  taskDescription: string | null;
  budget: number | null;
  projectName: string;
  createdByName: string;
  createdAt: string;
  alreadyResponded: string | null;
  expired: boolean;
}

export default function AtaApproval() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AtaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [response, setResponse] = useState<"approved" | "rejected" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("not_found");
      setLoading(false);
      return;
    }
    loadData();
  }, [token]);

  const loadData = async () => {
    try {
      // Through the edge function, never straight at the table: the anon key
      // ships in every bundle, so a policy the client could reach was a policy
      // anyone could reach. The token is the gate and it is checked server-side.
      const { data: res, error: fnErr } = await supabase.functions.invoke("ata-approval", {
        body: { token, action: "load" },
      });
      if (fnErr || !res || res.error) {
        setError(res?.error === "expired" ? "expired" : res?.error === "not_found" ? "not_found" : "error");
        return;
      }

      setData({
        taskTitle: res.taskTitle ?? "–",
        taskDescription: res.taskDescription ?? null,
        budget: res.budget ?? null,
        projectName: res.projectName ?? "–",
        createdByName: res.createdByName ?? "–",
        createdAt: res.createdAt,
        alreadyResponded: res.alreadyResponded,
        expired: false,
      });
    } catch {
      setError("error");
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = async (resp: "approved" | "rejected") => {
    if (!data) return;
    setSubmitting(true);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("ata-approval", {
        body: { token, action: "respond", response: resp, rejectionReason },
      });
      if (fnErr || !res?.ok) {
        // A spent link is not an error the customer caused — show them the
        // answer that already stands instead of a red box.
        if (res?.error === "already_used") {
          setData({ ...data, alreadyResponded: res.alreadyResponded });
          setSubmitted(true);
          return;
        }
        setError("error");
        return;
      }
      setResponse(resp);
      setSubmitted(true);
    } catch {
      setError("error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">
              {error === "not_found" && "Länken är ogiltig"}
              {error === "expired" && "Länken har gått ut"}
              {error === "error" && "Något gick fel"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {error === "not_found" && "Den här godkännande-länken finns inte eller har redan använts."}
              {error === "expired" && "Den här godkännande-länken har gått ut. Kontakta din entreprenör för en ny."}
              {error === "error" && "Försök igen eller kontakta din entreprenör."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  // Already responded
  if (data.alreadyResponded || submitted) {
    const resp = response || data.alreadyResponded;
    const isApproved = resp === "approved";
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            {isApproved ? (
              <div className="h-16 w-16 rounded-full bg-green-100 mx-auto mb-4 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-600" />
              </div>
            ) : (
              <div className="h-16 w-16 rounded-full bg-red-100 mx-auto mb-4 flex items-center justify-center">
                <X className="h-8 w-8 text-red-600" />
              </div>
            )}
            <h2 className="text-lg font-semibold mb-2">
              {isApproved ? "Tilläggsarbete godkänt" : "Tilläggsarbete nekat"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isApproved
                ? "Tack! Entreprenören har fått besked och kan påbörja arbetet."
                : "Entreprenören har fått besked om att tilläggsarbetet inte godkänts."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4 pt-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-sm text-muted-foreground mb-1">{data.projectName}</div>
          <h1 className="text-2xl font-bold">Godkänn tilläggsarbete</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {data.createdByName} vill utföra följande tilläggsarbete och behöver ditt godkännande.
          </p>
        </div>

        {/* ÄTA details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{data.taskTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.taskDescription && (
              <p className="text-sm text-muted-foreground">{data.taskDescription}</p>
            )}
            {data.budget && data.budget > 0 && (
              <div className="flex items-center justify-between py-2 border-t">
                <span className="text-sm font-medium">Kostnad</span>
                <span className="text-lg font-bold tabular-nums">
                  {data.budget.toLocaleString("sv-SE")} kr
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
              <Clock className="h-3 w-3" />
              Skickad {new Date(data.createdAt).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </CardContent>
        </Card>

        {/* Reject reason form */}
        {showRejectForm && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="text-sm font-medium">Varför nekar du? (valfritt)</p>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="T.ex. för dyrt, vill ha annat alternativ..."
                rows={3}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowRejectForm(false)}
                  disabled={submitting}
                >
                  Avbryt
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => handleResponse("rejected")}
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <X className="h-4 w-4 mr-1" />}
                  Neka
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action buttons */}
        {!showRejectForm && (
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-12"
              onClick={() => setShowRejectForm(true)}
              disabled={submitting}
            >
              <X className="h-4 w-4 mr-2" />
              Neka
            </Button>
            <Button
              className="flex-1 h-12"
              onClick={() => handleResponse("approved")}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Godkänn
            </Button>
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground">
          Ditt svar sparas och entreprenören meddelas direkt.
        </p>
      </div>
    </div>
  );
}
