/**
 * Bostadens papper — the home's own documents (P3).
 *
 * The papers about the HOME, not about a job: köpekontrakt, besiktnings-
 * protokoll, frågelista, energideklaration. Before this they could only be
 * filed under a renovation project, where the next renovation buries them and
 * deleting that project takes them with it.
 *
 * THE CATEGORY IS ALWAYS A GUESS THE USER APPROVES. `guessCategory` runs
 * locally on the file name (and, for files whose name says nothing, on the
 * opening of their text) — no model, no judgement call made out of sight — and
 * its answer is shown as a pre-filled suggestion before anything is saved.
 * Every field it guessed
 * stays editable afterwards: re-tag, rename, re-date. An assistant that files
 * things silently is one the user has to audit; one that proposes is one they
 * can trust.
 *
 * Access is owner + household admins, never the viewer role — a purchase
 * agreement carries the seller's personal number and the price paid. The
 * database enforces it (20260824130000); this file never checks.
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * A bucket of its own, and private.
 *
 * `project-files` is public: its /object/public/ endpoint serves any file to
 * anyone with the URL, no authentication (verified 2026-08-24). A purchase
 * agreement carries the seller's personal number, and that person never agreed
 * to anything with this app — so the home's papers never go in there. Access
 * here is only ever a short-lived signed URL.
 */
export const PROPERTY_DOC_BUCKET = 'property-documents';

export type PropertyDocumentCategory =
  | 'purchase_agreement'
  | 'settlement'
  | 'deposit_agreement'
  | 'listing'
  | 'seller_questionnaire'
  | 'inspection'
  | 'energy_declaration'
  | 'tax_assessment'
  | 'association'
  | 'insurance'
  | 'title_deed'
  | 'other';

/** Display order on the address page: buying the home, then knowing it. */
export const PROPERTY_DOC_CATEGORIES: {
  value: PropertyDocumentCategory;
  labelKey: string;
}[] = [
  { value: 'purchase_agreement', labelKey: 'addresses.documents.category.purchase_agreement' },
  { value: 'settlement', labelKey: 'addresses.documents.category.settlement' },
  { value: 'deposit_agreement', labelKey: 'addresses.documents.category.deposit_agreement' },
  { value: 'title_deed', labelKey: 'addresses.documents.category.title_deed' },
  { value: 'listing', labelKey: 'addresses.documents.category.listing' },
  { value: 'seller_questionnaire', labelKey: 'addresses.documents.category.seller_questionnaire' },
  { value: 'inspection', labelKey: 'addresses.documents.category.inspection' },
  { value: 'energy_declaration', labelKey: 'addresses.documents.category.energy_declaration' },
  { value: 'association', labelKey: 'addresses.documents.category.association' },
  { value: 'tax_assessment', labelKey: 'addresses.documents.category.tax_assessment' },
  { value: 'insurance', labelKey: 'addresses.documents.category.insurance' },
  { value: 'other', labelKey: 'addresses.documents.category.other' },
];

/**
 * P5: the facts one document states about the home. Read out only on an
 * explicit request, never at upload — and never containing a personal number
 * (the model is told to omit them and the result is scrubbed twice, server and
 * client). Shown as source material with the document's name beside each
 * fact; nothing here is a profit calculation.
 */
export interface PropertyFacts {
  address: { street: string; postal_code: string | null; city: string | null } | null;
  purchase_price: number | null;
  contract_date: string | null;
  possession_date: string | null;
  living_area_sqm: number | null;
  build_year: number | null;
  property_designation: string | null;
  brf_name: string | null;
  brf_org_number: string | null;
  apartment_number: string | null;
  monthly_fee: number | null;
  tenure: 'bostadsratt' | 'aganderatt' | 'hyresratt' | null;
}

export type ExtractionStatus = 'none' | 'pending' | 'done' | 'failed';

export interface PropertyDocument {
  id: string;
  property_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  category: PropertyDocumentCategory;
  document_date: string | null;
  created_at: string;
  extracted: PropertyFacts | null;
  extraction_status: ExtractionStatus;
}

/** One select string, so a row looks the same wherever it is read. */
export const PROPERTY_DOCUMENT_COLUMNS =
  'id, property_id, storage_path, file_name, mime_type, file_size, category, document_date, created_at, extracted, extraction_status';

/**
 * Swedish keyword rules, most specific first. Deliberately local: guessing
 * from a file name costs nothing and gives the user something to correct,
 * whereas sending every dropped file to a model to be classified would be both
 * slower and a decision made somewhere they cannot see.
 */
const CATEGORY_RULES: {
  category: PropertyDocumentCategory;
  patterns: RegExp;
  /**
   * The subset of words that identify the document when found in its TEXT.
   * Deliberately narrower than the file-name patterns: a person who names a
   * file "brf.pdf" means the association, but the word "brf" inside a
   * renovation invoice is just the customer's address. Rules without one never
   * match on text at all.
   */
  textPatterns?: RegExp;
}[] = [
  { category: 'purchase_agreement', patterns: /kopekontrakt|kopebrev|overlatelseavtal|upplatelseavtal|purchase agreement|kontrakt.*bostad/, textPatterns: /kopekontrakt|kopebrev|overlatelseavtal|upplatelseavtal/ },
  { category: 'settlement', patterns: /likvidavrakning|slutavrakning|settlement/, textPatterns: /likvidavrakning|slutavrakning/ },
  { category: 'deposit_agreement', patterns: /handpenning|deposition|depositionsavtal/, textPatterns: /handpenningsavtal|depositionsavtal/ },
  { category: 'title_deed', patterns: /lagfart|pantbrev|gravationsbevis|title deed/, textPatterns: /lagfartsbevis|gravationsbevis|pantbrev/ },
  { category: 'seller_questionnaire', patterns: /fragelista|saljarens fragelista|questionnaire/, textPatterns: /fragelista/ },
  { category: 'inspection', patterns: /besiktning|overlatelsebesiktning|besiktningsprotokoll|radon|fuktmatning|inspection/, textPatterns: /besiktningsprotokoll|overlatelsebesiktning|besiktningsutlatande/ },
  { category: 'energy_declaration', patterns: /energideklaration|energiprestanda|energy declaration/, textPatterns: /energideklaration/ },
  { category: 'tax_assessment', patterns: /taxering|taxeringsbeslut|fastighetsdeklaration|taxeringsvarde/, textPatterns: /taxeringsbeslut|fastighetstaxering/ },
  { category: 'association', patterns: /stadgar|arsredovisning|foreningen|brf|medlemskap|lagenhetsforteckning/, textPatterns: /arsredovisning|stadgar for|lagenhetsforteckning/ },
  { category: 'insurance', patterns: /forsakring|forsakringsbrev|hemforsakring|villaforsakring|insurance/, textPatterns: /forsakringsbrev/ },
  { category: 'listing', patterns: /objektsbeskrivning|prospekt|maklarbild|listing/, textPatterns: /objektsbeskrivning/ },
];

/** Fold Swedish diacritics so "köpekontrakt" and "kopekontrakt" both match. */
function foldForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[éè]/g, 'e')
    .replace(/[_\-.]+/g, ' ');
}

/**
 * How much of a document's text counts as its "title area".
 *
 * A keyword in the heading of a scanned PDF identifies it; the same keyword
 * three pages in is just a mention — a renovation quote that references
 * "besiktning" is not a besiktningsprotokoll. Scans arrive as `scan0012.pdf`
 * often enough that the file name alone cannot carry this, so the text is
 * consulted — but only where a document says what it is.
 */
const TITLE_AREA_CHARS = 600;

/**
 * A first guess at what this document is. Returns 'other' when nothing matches
 * — an honest shrug the user corrects, never a confident wrong answer.
 *
 * The file name is the strong signal and is tried first. `textSnippet` is the
 * fallback for documents whose name says nothing, and only its opening is read
 * (see TITLE_AREA_CHARS).
 */
export function guessCategory(
  fileName: string,
  textSnippet?: string | null
): PropertyDocumentCategory {
  const fromName = foldForMatch(fileName);
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.test(fromName)) return rule.category;
  }

  if (textSnippet) {
    const fromText = foldForMatch(textSnippet.slice(0, TITLE_AREA_CHARS));
    for (const rule of CATEGORY_RULES) {
      if (rule.textPatterns?.test(fromText)) return rule.category;
    }
  }
  return 'other';
}

/** True when the guess came from an actual keyword rather than the fallback. */
export function wasRecognised(category: PropertyDocumentCategory): boolean {
  return category !== 'other';
}

export async function listPropertyDocuments(propertyId: string): Promise<PropertyDocument[]> {
  const { data, error } = await supabase
    .from('property_documents')
    .select(PROPERTY_DOCUMENT_COLUMNS)
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('listPropertyDocuments failed:', error);
    return [];
  }
  return (data ?? []) as PropertyDocument[];
}

/** Strip anything that would make a storage key awkward, keep it recognisable. */
function safeSegment(fileName: string): string {
  return fileName
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(-120);
}

export interface UploadInput {
  propertyId: string;
  file: File;
  category: PropertyDocumentCategory;
  /** What the user wants it called — defaults to the file's own name. */
  displayName?: string;
  documentDate?: string | null;
}

/**
 * Save one document.
 *
 * Row first, then file: the storage read policy resolves access THROUGH the
 * row, so a file uploaded before its row would be unreadable even to the person
 * who just uploaded it. If the upload then fails, the row is removed again —
 * a listed document whose file is missing is worse than no document at all.
 */
export async function uploadPropertyDocument(
  input: UploadInput
): Promise<PropertyDocument | null> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('id').eq('user_id', user.id).maybeSingle()
    : { data: null };

  // The bucket holds nothing else, so the path starts at the address id.
  const storagePath = `${input.propertyId}/${crypto.randomUUID()}-${safeSegment(input.file.name)}`;

  const { data: row, error: rowError } = await supabase
    .from('property_documents')
    .insert({
      property_id: input.propertyId,
      storage_path: storagePath,
      file_name: (input.displayName ?? input.file.name).trim() || input.file.name,
      mime_type: input.file.type || null,
      file_size: input.file.size,
      category: input.category,
      document_date: input.documentDate ?? null,
      uploaded_by: profile?.id ?? null,
    })
    .select(PROPERTY_DOCUMENT_COLUMNS)
    .single();

  if (rowError || !row) {
    console.error('uploadPropertyDocument: row insert failed', rowError);
    return null;
  }

  const { error: uploadError } = await supabase.storage
    .from(PROPERTY_DOC_BUCKET)
    .upload(storagePath, input.file, { upsert: false, contentType: input.file.type || undefined });

  if (uploadError) {
    console.error('uploadPropertyDocument: upload failed, rolling back row', uploadError);
    await supabase.from('property_documents').delete().eq('id', row.id);
    return null;
  }

  return row as PropertyDocument;
}

/**
 * Correct a document afterwards — re-tag, rename, re-date.
 *
 * This is the other half of "the app proposes": a guess you cannot fix later is
 * just a slower way of being wrong.
 */
export async function updatePropertyDocument(
  documentId: string,
  updates: { category?: PropertyDocumentCategory; file_name?: string; document_date?: string | null }
): Promise<boolean> {
  const patch: Record<string, unknown> = {};
  if (updates.category) patch.category = updates.category;
  if (updates.file_name !== undefined) patch.file_name = updates.file_name.trim();
  if (updates.document_date !== undefined) patch.document_date = updates.document_date;
  if (Object.keys(patch).length === 0) return true;

  patch.updated_at = new Date().toISOString();

  const { error } = await supabase.from('property_documents').update(patch).eq('id', documentId);
  if (error) {
    console.error('updatePropertyDocument failed:', error);
    return false;
  }
  return true;
}

/**
 * Remove a document. File first, then row — the reverse of upload, and for the
 * same reason: the row is what authorises the delete on the file.
 */
export async function deletePropertyDocument(doc: PropertyDocument): Promise<boolean> {
  const { error: storageError } = await supabase.storage
    .from(PROPERTY_DOC_BUCKET)
    .remove([doc.storage_path]);

  if (storageError) {
    console.error('deletePropertyDocument: storage remove failed', storageError);
    return false;
  }

  const { error } = await supabase.from('property_documents').delete().eq('id', doc.id);
  if (error) {
    console.error('deletePropertyDocument: row delete failed', error);
    return false;
  }
  return true;
}

/**
 * Record what a document said about the home (P5), or that reading it failed.
 * `facts` is stored as given — the scrubbing happened before this is called.
 */
export async function saveExtractedFacts(
  documentId: string,
  facts: PropertyFacts | null,
  status: ExtractionStatus
): Promise<boolean> {
  const { error } = await supabase
    .from('property_documents')
    .update({ extracted: facts, extraction_status: status, updated_at: new Date().toISOString() })
    .eq('id', documentId);
  if (error) {
    console.error('saveExtractedFacts failed:', error);
    return false;
  }
  return true;
}

/** A short-lived link for opening or downloading one document. */
export async function getPropertyDocumentUrl(doc: PropertyDocument): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PROPERTY_DOC_BUCKET)
    .createSignedUrl(doc.storage_path, 60 * 10);

  if (error || !data) {
    console.error('getPropertyDocumentUrl failed:', error);
    return null;
  }
  return data.signedUrl;
}
