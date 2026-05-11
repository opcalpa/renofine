/**
 * TypeScript types for AI Document Extraction
 * Used for extracting rooms and tasks from uploaded documents (PDF, DOC, TXT)
 */

/**
 * Task categories that map to cost_center values in the database
 */
export type TaskCategory =
  | 'rivning'     // Demolition
  | 'el'          // Electrical
  | 'vvs'         // Plumbing
  | 'malning'     // Painting
  | 'golv'        // Flooring
  | 'kok'         // Kitchen
  | 'badrum'      // Bathroom
  | 'snickeri'    // Carpentry
  | 'kakel'       // Tiles
  | 'ovrigt';     // Other

/**
 * Extracted room from document
 */
export interface ExtractedRoom {
  name: string;
  estimatedAreaSqm: number | null;
  description: string | null;
  confidence: number; // 0-1, indicates AI confidence in extraction
  sourceText: string; // Original text from document
}

/**
 * Extracted task from document
 */
export interface ExtractedTask {
  title: string;
  description: string | null;
  category: TaskCategory;
  roomName: string | null; // Reference to room by name for linking
  confidence: number; // 0-1, indicates AI confidence in extraction
  sourceText: string; // Original text from document
  // Quote mode fields (populated when extracted from quotes/invoices)
  estimatedCost: number | null;
  laborCost: number | null;
  materialCost: number | null;
  startDate: string | null;
  endDate: string | null;
  // Material budget fields — material lines become planned materials, not tasks
  isMaterialBudget: boolean;
  parentTaskName: string | null; // e.g. "Målning" for "Material för målning"
  // ROT deduction fields
  rotEligible: boolean;
  rotAmount: number | null;
  // VAT context
  isIncludingVat: boolean;
}

/**
 * Quote source classification — drives default import-mode in the modal.
 * - building_supplier: pure material quote from a supplier (Vindö, Beijer, Bauhaus, …) → default to inköpsorder
 * - contractor: labor-driven quote from a snickare/hantverkare → default to materialbudget
 * - mixed: contains both clearly-material batches AND separate labor items → ask user
 */
export type QuoteSource = 'building_supplier' | 'contractor' | 'mixed';

/**
 * Result from AI document analysis
 */
export interface QuoteMetadata {
  vendorName: string | null;
  totalAmount: number | null;
  vatAmount: number | null;
  validUntil: string | null;
  quoteDate: string | null;
  quoteNumber: string | null;
  paymentTerms: string | null;
  isIncludingVat: boolean;
  totalRotAmount: number | null;
  quoteSource: QuoteSource | null;
}

export interface AIDocumentExtractionResult {
  rooms: ExtractedRoom[];
  tasks: ExtractedTask[];
  documentSummary: string;
  quoteMetadata?: QuoteMetadata | null;
}

/**
 * Room with selection state for UI
 */
export interface SelectableRoom extends ExtractedRoom {
  index: number;
  selected: boolean;
  edited: boolean;
}

/**
 * Task with selection state for UI (work items only, not material budget lines)
 */
export interface SelectableTask extends ExtractedTask {
  index: number;
  selected: boolean;
  edited: boolean;
  // Resolved material children (populated client-side from isMaterialBudget items)
  materialChildren?: ExtractedTask[];
}

/**
 * Maps task categories to Swedish display names
 */
export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  rivning: 'Rivning',
  el: 'El',
  vvs: 'VVS',
  malning: 'Målning',
  golv: 'Golv',
  kok: 'Kök',
  badrum: 'Badrum',
  snickeri: 'Snickeri',
  kakel: 'Kakel',
  ovrigt: 'Övrigt',
};

/**
 * Maps task categories to cost_center values in database
 */
export const TASK_CATEGORY_TO_COST_CENTER: Record<TaskCategory, string> = {
  rivning: 'construction',
  el: 'electricity',
  vvs: 'plumbing',
  malning: 'paint',
  golv: 'floor',
  kok: 'kitchen',
  badrum: 'bathrooms',
  snickeri: 'carpentry',
  kakel: 'tiles',
  ovrigt: 'construction',
};
