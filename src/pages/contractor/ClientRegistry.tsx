import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { AppHeader } from "@/components/AppHeader";
import { CreateClientDialog, type Client } from "@/components/quotes/CreateClientDialog";
import { PasteClientsDialog } from "@/components/clients/PasteClientsDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export default function ClientRegistry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthSession();

  const [clients, setClients] = useState<Client[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | undefined>();
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setUserEmail(user.email);
    supabase
      .from("profiles")
      .select("id, name, avatar_url")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfileId(data.id);
          setUserName(data.name ?? undefined);
          setAvatarUrl(data.avatar_url ?? undefined);
          // Pasted customers belong to the FIRM, not to one person's profile —
          // that is the whole point of the company entity.
          supabase
            .from("company_members")
            .select("company_id")
            .eq("profile_id", data.id)
            .limit(1)
            .maybeSingle()
            .then(({ data: member }) => setCompanyId(member?.company_id ?? null));
        }
      });
  }, [user]);

  const loadClients = useCallback(async () => {
    if (!profileId) return;
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("owner_id", profileId)
      .order("name");
    if (data) setClients(data as Client[]);
  }, [profileId]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleSaved = (client: Client) => {
    setClients((prev) => {
      const idx = prev.findIndex((c) => c.id === client.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = client;
        return next;
      }
      return [...prev, client].sort((a, b) => a.name.localeCompare(b.name));
    });
    setEditClient(undefined);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("clients").delete().eq("id", deleteId);
    if (error) {
      console.error("Failed to delete client:", error);
      toast.error(t("errors.generic"));
    } else {
      setClients((prev) => prev.filter((c) => c.id !== deleteId));
      toast.success(t("clients.deleteClient"));
    }
    setDeleteId(null);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // Auth + role check handled by RequireAuth + RequireRole wrappers in App.tsx
  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader userName={userName} userEmail={userEmail} avatarUrl={avatarUrl} onSignOut={handleSignOut} />
      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("clients.title")}</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPasteOpen(true)} className="min-h-[44px]">
              <ClipboardPaste className="h-4 w-4 mr-2" />
              {t("clients.pasteAction", "Klistra in")}
            </Button>
            <Button onClick={() => { setEditClient(undefined); setDialogOpen(true); }} className="min-h-[44px]">
              <Plus className="h-4 w-4 mr-2" />
              {t("clients.createNew")}
            </Button>
          </div>
        </div>

        {profileId && (
          <PasteClientsDialog
            open={pasteOpen}
            onOpenChange={setPasteOpen}
            ownerId={profileId}
            companyId={companyId}
            onImported={loadClients}
          />
        )}

        {clients.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">{t("clients.noClients")}</p>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("clients.name")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("clients.email")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("clients.phone")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("clients.city")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("clients.reference")}</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">{c.email}</TableCell>
                    <TableCell className="hidden sm:table-cell">{c.phone}</TableCell>
                    <TableCell className="hidden md:table-cell">{c.city}</TableCell>
                    <TableCell className="hidden md:table-cell">{c.reference}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => { setEditClient(c); setDialogOpen(true); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeleteId(c.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      {profileId && (
        <CreateClientDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditClient(undefined); }}
          onSaved={handleSaved}
          editClient={editClient}
          ownerId={profileId}
        />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clients.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
