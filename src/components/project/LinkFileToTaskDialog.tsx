import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PICKABLE_DOCUMENT_TYPES,
  type DocumentType,
} from "@/services/smartUploadService";

/** Picker headings, in the order the taxonomy ranks them. */
const TYPE_GROUP_ORDER = [
  { group: "economy" as const, key: "smartUpload.groups.economy", fallback: "Ekonomi" },
  { group: "legal" as const, key: "smartUpload.groups.legal", fallback: "Juridik & ansvar" },
  { group: "technical" as const, key: "smartUpload.groups.technical", fallback: "Teknik" },
  { group: "fallback" as const, key: "smartUpload.groups.fallback", fallback: "Vet inte" },
];
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Link as LinkIcon } from "lucide-react";

interface FileInfo {
  name: string;
  path: string;
  size: number;
  type: string;
}

interface LinkFileToTaskDialogProps {
  projectId: string;
  file: FileInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked?: () => void;
}

interface TaskOption {
  id: string;
  title: string;
}

interface RoomOption {
  id: string;
  name: string;
}

export const LinkFileToTaskDialog = ({
  projectId,
  file,
  open,
  onOpenChange,
  onLinked,
}: LinkFileToTaskDialogProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<TaskOption[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  // Not "invoice": a default that names a specific type is a wrong answer for
  // every other paper, and the whole taxonomy rests on Övrigt being the honest
  // starting point (docs/dokumenttyper-2026-09.md).
  const [fileType, setFileType] = useState<DocumentType>("other");
  /** The existing link row, when this file already has one — then we UPDATE. */
  const [existingLinkId, setExistingLinkId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  useEffect(() => {
    if (open) {
      fetchTasks();
      fetchRooms();
      setSearch("");
      // Load what this file ALREADY is, rather than resetting it. Opening the
      // dialog on a typed file used to blank it back to "invoice", so a person
      // checking a room assignment could silently retype a certificate.
      void loadExistingLink();
    }
  }, [open, projectId]);

  useEffect(() => {
    if (!search.trim()) {
      setFilteredTasks(tasks);
    } else {
      const lower = search.toLowerCase();
      setFilteredTasks(tasks.filter((t) => t.title.toLowerCase().includes(lower)));
    }
  }, [search, tasks]);

  const fetchTasks = async () => {
    setLoadingTasks(true);
    const { data, error } = await supabase
      .from("tasks")
      .select("id, title")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load tasks:", error);
    } else {
      setTasks(data || []);
      setFilteredTasks(data || []);
    }
    setLoadingTasks(false);
  };

  const fetchRooms = async () => {
    const { data, error } = await supabase
      .from("rooms")
      .select("id, name")
      .eq("project_id", projectId)
      .order("name");

    if (error) {
      console.error("Failed to load rooms:", error);
    } else {
      setRooms(data || []);
    }
  };

  /** The file's current link row — the values the dialog starts from. */
  const loadExistingLink = async () => {
    setExistingLinkId(null);
    setSelectedTaskId("");
    setSelectedRoomId("");
    setFileType("other");
    if (!file) return;
    const { data, error } = await supabase
      .from("task_file_links")
      .select("id, task_id, room_id, file_type")
      .eq("project_id", projectId)
      .eq("file_path", file.path)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      // Not fatal: the dialog still works as a fresh link. Saying nothing is
      // right here — the person asked to link a file, not to hear about a
      // lookup — but it must not be silent in the console.
      console.error("LinkFileToTaskDialog: existing link lookup failed", error);
      return;
    }
    if (!data) return;
    setExistingLinkId(data.id);
    setSelectedTaskId(data.task_id ?? "");
    setSelectedRoomId(data.room_id ?? "");
    if (data.file_type) setFileType(data.file_type as DocumentType);
  };

  const handleLink = async () => {
    if (!file || (!selectedTaskId && !selectedRoomId)) return;

    setLinking(true);
    const { data: userData } = await supabase.auth.getUser();
    let profileId: string | null = null;
    if (userData?.user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userData.user.id)
        .single();
      profileId = profile?.id ?? null;
    }

    // Update when this file already has a link row. It used to INSERT every
    // time, which meant the type could never be CHANGED — only a second,
    // contradicting row added, and `file_type` was in practice write-once
    // across the whole app (verified 2026-09-04: no UPDATE of it anywhere).
    const { error } = existingLinkId
      ? await supabase
          .from("task_file_links")
          .update({
            task_id: selectedTaskId || null,
            room_id: selectedRoomId || null,
            file_type: fileType,
          })
          .eq("id", existingLinkId)
      : await supabase.from("task_file_links").insert({
          project_id: projectId,
          task_id: selectedTaskId || null,
          room_id: selectedRoomId || null,
          file_path: file.path,
          file_name: file.name,
          file_type: fileType,
          file_size: file.size,
          mime_type: file.type,
          linked_by_user_id: profileId,
        });

    setLinking(false);

    if (error) {
      console.error("Failed to link file:", error);
      toast({
        title: t("files.errorLinkingFile", "Could not link file"),
        variant: "destructive",
      });
      return;
    }

    toast({ title: t("files.fileLinked", "File linked successfully") });
    onOpenChange(false);
    onLinked?.();
  };

  // Naming the paper IS the change. Requiring a room or a task first meant a
  // våtrumsintyg could not be typed at all unless it also belonged somewhere,
  // which is backwards: you know what it is before you know where it goes.
  const canLink = !!(selectedTaskId || selectedRoomId || fileType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            {t("files.linkFile", "Link File")}
          </DialogTitle>
          <DialogDescription>{file?.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File type */}
          <div className="space-y-2">
            <Label>{t("files.fileType", "File Type")}</Label>
            <Select value={fileType} onValueChange={(v) => setFileType(v as DocumentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* From the catalog — this list used to offer four of thirteen
                    types, so nine papers could only ever be "Other". */}
                {TYPE_GROUP_ORDER.map((group) => {
                  const types = PICKABLE_DOCUMENT_TYPES.filter((d) => d.group === group.group);
                  if (types.length === 0) return null;
                  return (
                    <SelectGroup key={group.group}>
                      <SelectLabel>{t(group.key, group.fallback)}</SelectLabel>
                      {types.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {t(d.labelKey, d.fallback)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Room picker */}
          <div className="space-y-2">
            <Label>{t("files.selectRoom", "Link to Room")}</Label>
            <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
              <SelectTrigger>
                <SelectValue placeholder={t("files.noRoom", "No room")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("files.noRoom", "No room")}</SelectItem>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Task picker */}
          <div className="space-y-2">
            <Label>{t("files.selectTask", "Link to Task")}</Label>
            <Input
              placeholder={t("common.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="border rounded-md max-h-40 overflow-y-auto">
              {loadingTasks ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : filteredTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3">
                  {t("tasks.noTasks", "No tasks")}
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors text-muted-foreground ${
                      !selectedTaskId ? "bg-primary/10 font-medium text-foreground" : ""
                    }`}
                    onClick={() => setSelectedTaskId("")}
                  >
                    {t("files.noTask", "No task")}
                  </button>
                  {filteredTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${
                        selectedTaskId === task.id ? "bg-primary/10 font-medium" : ""
                      }`}
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      {task.title}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Help text */}
          {!canLink && (
            <p className="text-sm text-muted-foreground">
              {t("files.selectRoomOrTask", "Select at least one room or task to link the file to.")}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleLink} disabled={!canLink || linking}>
            {linking ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <LinkIcon className="h-4 w-4 mr-2" />
            )}
            {t("files.linkFile", "Link File")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
