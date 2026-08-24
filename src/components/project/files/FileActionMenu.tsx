import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Eye, Download, Sparkles, Layers, Link, MessageSquare, House, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface FileActionMenuFile {
  id: string;
  name: string;
  path: string;
  type: string;
}

interface FileActionMenuProps {
  file: FileActionMenuFile;
  canEdit?: boolean;
  onPreview: (file: FileActionMenuFile) => void;
  onDownload: (file: FileActionMenuFile) => void;
  onSmartTolk: (file: FileActionMenuFile) => void;
  onUseAsBackground?: (url: string, name: string) => void;
  onLink?: (file: FileActionMenuFile) => void;
  onComments?: (file: FileActionMenuFile) => void;
  /**
   * P4: this document is about the HOME, not this job. Only passed when the
   * project sits on an address the user may manage — the move has somewhere
   * to go and someone allowed to put it there.
   */
  onMoveToProperty?: (file: FileActionMenuFile) => void;
  onDelete?: (file: FileActionMenuFile) => void;
}

export function FileActionMenu({
  file,
  canEdit,
  onPreview,
  onDownload,
  onSmartTolk,
  onUseAsBackground,
  onLink,
  onComments,
  onMoveToProperty,
  onDelete,
}: FileActionMenuProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onPreview(file)}>
          <Eye className="h-4 w-4 mr-2" />
          {t("files.preview", "Förhandsgranska")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDownload(file)}>
          <Download className="h-4 w-4 mr-2" />
          {t("common.download", "Ladda ner")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onSmartTolk(file)}>
          <Sparkles className="h-4 w-4 mr-2" />
          {t("files.smartTolk", "Smart tolk")}
        </DropdownMenuItem>
        {file.type?.startsWith("image/") && onUseAsBackground && (
          <DropdownMenuItem
            onClick={() => {
              const { data: { publicUrl } } = supabase.storage
                .from("project-files")
                .getPublicUrl(file.path);
              onUseAsBackground(publicUrl, file.name);
            }}
          >
            <Layers className="h-4 w-4 mr-2" />
            {t("files.useAsBackground", "Använd som planritning")}
          </DropdownMenuItem>
        )}
        {canEdit && onLink && (
          <DropdownMenuItem onClick={() => onLink(file)}>
            <Link className="h-4 w-4 mr-2" />
            {t("files.linkToTask", "Koppla till arbete")}
          </DropdownMenuItem>
        )}
        {onComments && (
          <DropdownMenuItem onClick={() => onComments(file)}>
            <MessageSquare className="h-4 w-4 mr-2" />
            {t("common.comments", "Kommentarer")}
          </DropdownMenuItem>
        )}
        {canEdit && onMoveToProperty && (
          <DropdownMenuItem onClick={() => onMoveToProperty(file)}>
            <House className="h-4 w-4 mr-2" />
            {t("files.moveToProperty.action", "Flytta till bostaden")}
          </DropdownMenuItem>
        )}
        {canEdit && onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(file)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("common.delete", "Ta bort")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
