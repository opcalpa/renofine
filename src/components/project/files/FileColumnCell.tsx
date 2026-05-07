import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TableCell } from "@/components/ui/table";
import { Check } from "lucide-react";
import type { ProjectFile, FileLink, FileColKey, NamedEntity } from "./types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FileColumnCellProps {
  col: FileColKey;
  file: ProjectFile;
  links: FileLink[];
  fileCat: string;
  allCats: string[];
  availTasks: NamedEntity[];
  availMaterials: NamedEntity[];
  availRooms: NamedEntity[];
  fileColLabels: Record<FileColKey, string>;
  setCategoryForFile: (path: string, cat: string) => void;
  linkFileToEntity: (file: ProjectFile, entityType: "task" | "material" | "room", entityId: string) => void;
  unlinkFileEntity: (file: ProjectFile, entityType: "task" | "material" | "room", entityId: string) => void;
  ensureFileLink: (file: ProjectFile) => Promise<string | null>;
  updateFileLink: (linkId: string, updates: Record<string, unknown>) => Promise<void>;
  formatFileSize: (bytes: number) => string;
  formatDate: (dateStr: string) => string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FileColumnCell({
  col,
  file,
  links,
  fileCat,
  allCats,
  availTasks,
  availMaterials,
  availRooms,
  fileColLabels,
  setCategoryForFile,
  linkFileToEntity,
  unlinkFileEntity,
  ensureFileLink,
  updateFileLink,
  formatFileSize,
  formatDate,
}: FileColumnCellProps) {
  // ---- Category popover ----
  if (col === "category") {
    return (
      <TableCell key={col} className="whitespace-nowrap">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-xs hover:bg-muted px-1.5 py-0.5 rounded transition-colors"
            >
              {fileCat ? (
                <Badge variant="outline">{fileCat}</Badge>
              ) : (
                <span className="text-muted-foreground/40">–</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-1" align="start">
            {allCats.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryForFile(file.path, cat)}
                className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted flex items-center gap-2 ${fileCat === cat ? "bg-muted font-medium" : ""}`}
              >
                {fileCat === cat && (
                  <Check className="h-3 w-3 text-primary" />
                )}
                <span className={fileCat === cat ? "" : "pl-5"}>{cat}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </TableCell>
    );
  }

  // ---- Entity link columns (task / purchase / room) ----
  if (col === "task" || col === "purchase" || col === "room") {
    const nameField =
      col === "task"
        ? "task_name"
        : col === "purchase"
          ? "material_name"
          : "room_name";
    const idField =
      col === "task"
        ? "task_id"
        : col === "purchase"
          ? "material_id"
          : "room_id";
    const entityType: "task" | "material" | "room" =
      col === "task" ? "task" : col === "purchase" ? "material" : "room";
    const options =
      col === "task"
        ? availTasks
        : col === "purchase"
          ? availMaterials
          : availRooms;
    const linkedEntities = links.filter(
      (l) => (l as Record<string, unknown>)[nameField],
    );
    const linkedIds = new Set(
      links
        .map((l) => (l as Record<string, unknown>)[idField] as string)
        .filter(Boolean),
    );
    return (
      <TableCell key={col} className="whitespace-nowrap">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-xs hover:bg-muted px-1.5 py-0.5 rounded transition-colors min-w-[40px] max-w-[180px] text-left"
            >
              {linkedEntities.length > 0 ? (
                <span className="text-foreground truncate block">
                  {linkedEntities
                    .slice(0, 2)
                    .map(
                      (l) => (l as Record<string, unknown>)[nameField],
                    )
                    .join(", ")}
                  {linkedEntities.length > 2 && (
                    <span className="text-muted-foreground ml-1">
                      +{linkedEntities.length - 2}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground/40">–</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-52 p-1 max-h-64 overflow-y-auto"
            align="start"
          >
            {options.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">–</p>
            ) : (
              options.map((opt) => {
                const isLinked = linkedIds.has(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      isLinked
                        ? unlinkFileEntity(file, entityType, opt.id)
                        : linkFileToEntity(file, entityType, opt.id)
                    }
                    className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted flex items-center gap-2 ${isLinked ? "bg-primary/5 font-medium" : ""}`}
                  >
                    {isLinked && (
                      <Check className="h-3 w-3 text-primary shrink-0" />
                    )}
                    <span className={isLinked ? "" : "pl-5"} title={opt.name}>
                      {opt.name}
                    </span>
                  </button>
                );
              })
            )}
          </PopoverContent>
        </Popover>
      </TableCell>
    );
  }

  // ---- Vendor name ----
  if (col === "vendor") {
    const link = links[0];
    const vendor = link?.vendor_name;
    return (
      <TableCell key={col} className="whitespace-nowrap">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-xs hover:bg-muted px-1.5 py-0.5 rounded transition-colors min-w-[40px]"
            >
              {vendor || <span className="text-muted-foreground/40">–</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-3" align="start">
            <div className="space-y-2">
              <Label className="text-xs">{fileColLabels[col]}</Label>
              <Input
                type="text"
                defaultValue={vendor || ""}
                className="h-8 text-sm"
                autoFocus
                onBlur={async (e) => {
                  const val = e.target.value.trim();
                  let linkId = link?.id;
                  if (!linkId)
                    linkId = (await ensureFileLink(file)) || undefined;
                  if (!linkId) return;
                  await updateFileLink(linkId, {
                    vendor_name: val || null,
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
          </PopoverContent>
        </Popover>
      </TableCell>
    );
  }

  // ---- Date / amount / ROT columns ----
  if (
    col === "invoiceDate" ||
    col === "invoiceAmount" ||
    col === "rotAmount"
  ) {
    const link = links[0];
    const dbField =
      col === "invoiceDate"
        ? "invoice_date"
        : col === "invoiceAmount"
          ? "invoice_amount"
          : "rot_amount";
    const currentVal = link
      ? (link as Record<string, unknown>)[dbField]
      : null;
    const isDate = col === "invoiceDate";
    const displayVal = isDate
      ? currentVal
        ? String(currentVal).slice(0, 10)
        : null
      : currentVal != null
        ? `${Number(currentVal).toLocaleString("sv-SE")} kr`
        : null;
    return (
      <TableCell key={col} className="whitespace-nowrap">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-xs hover:bg-muted px-1.5 py-0.5 rounded transition-colors min-w-[40px]"
            >
              {displayVal || (
                <span className="text-muted-foreground/40">–</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-3" align="start">
            <div className="space-y-2">
              <Label className="text-xs">{fileColLabels[col]}</Label>
              <Input
                type={isDate ? "date" : "number"}
                step={isDate ? undefined : "1"}
                defaultValue={currentVal != null ? String(currentVal) : ""}
                className="h-8 text-sm"
                autoFocus
                onBlur={async (e) => {
                  const val = e.target.value;
                  let linkId = link?.id;
                  if (!linkId)
                    linkId = (await ensureFileLink(file)) || undefined;
                  if (!linkId) return;
                  await updateFileLink(linkId, {
                    [dbField]: isDate
                      ? val || null
                      : val
                        ? parseFloat(val)
                        : null,
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
          </PopoverContent>
        </Popover>
      </TableCell>
    );
  }

  // ---- AI summary ----
  if (col === "summary") {
    const summary = links[0]?.ai_summary;
    return (
      <TableCell
        key={col}
        className="whitespace-nowrap text-xs text-muted-foreground truncate max-w-[180px]"
        title={summary || ""}
      >
        {summary || <span className="text-muted-foreground/40">–</span>}
      </TableCell>
    );
  }

  // ---- Type / Size / Uploaded ----
  return (
    <TableCell key={col} className="whitespace-nowrap text-muted-foreground">
      {col === "type" && (
        <Badge variant="outline">
          {file.type?.split("/")[1] || "?"}
        </Badge>
      )}
      {col === "size" && file.size ? formatFileSize(file.size) : ""}
      {col === "uploaded" && file.uploaded_at
        ? formatDate(file.uploaded_at)
        : ""}
    </TableCell>
  );
}
