// ---------------------------------------------------------------------------
// Shared types and constants for the project files feature
// ---------------------------------------------------------------------------

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  uploaded_at: string;
  uploaded_by?: string;
  uploader_name?: string;
  folder?: string;
  thumbnail_url?: string;
}

export interface ProjectFolder {
  id: string;
  name: string;
  path: string;
}

export interface FileLink {
  id?: string;
  file_path: string;
  task_id: string | null;
  material_id: string | null;
  room_id: string | null;
  file_type: string;
  invoice_date?: string | null;
  invoice_amount?: number | null;
  rot_amount?: number | null;
  vendor_name?: string | null;
  ai_summary?: string | null;
  task_name?: string;
  material_name?: string;
  room_name?: string;
}

export interface NamedEntity {
  id: string;
  name: string;
}

export type FileSortKey =
  | "name"
  | "category"
  | "task"
  | "purchase"
  | "room"
  | "vendor"
  | "invoiceDate"
  | "invoiceAmount"
  | "rotAmount"
  | "summary"
  | "type"
  | "size"
  | "uploaded";

export type FileColKey =
  | "category"
  | "task"
  | "purchase"
  | "room"
  | "vendor"
  | "invoiceDate"
  | "invoiceAmount"
  | "rotAmount"
  | "summary"
  | "size"
  | "uploaded"
  | "type";

export type FilesViewMode = "folder" | "grid" | "flat";

export const ALL_FILE_COLS: FileColKey[] = [
  "category",
  "task",
  "purchase",
  "room",
  "vendor",
  "invoiceDate",
  "invoiceAmount",
  "rotAmount",
  "summary",
  "size",
  "uploaded",
  "type",
];

export const DEFAULT_HIDDEN_COLS: FileColKey[] = [
  "type",
  "room",
  "invoiceDate",
  "invoiceAmount",
  "rotAmount",
  "vendor",
  "summary",
];

export const IMAGE_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "heic",
  "svg",
  "bmp",
]);

export const isImageFile = (name: string) =>
  IMAGE_EXTS.has(name.split(".").pop()?.toLowerCase() || "");

/** Map DB file_type to Swedish display label */
export const FILE_TYPE_LABELS: Record<string, string> = {
  quote: "Offert",
  invoice: "Faktura",
  receipt: "Kvitto",
  contract: "Kontrakt",
  specification: "Specifikation",
  floor_plan: "Ritning",
};
