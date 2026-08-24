/**
 * Bostadens papper — the home's own documents (P3).
 *
 * The papers about the HOME, not about a job: köpekontrakt, besiktnings-
 * protokoll, frågelista, energideklaration. Before this they could only be
 * filed under a renovation project, where the next renovation buries them and
 * deleting that project takes them with it.
 *
 * THE CATEGORY IS ALWAYS A GUESS THE USER APPROVES. `guessCategory` runs
 * locally on the file name — no model, no network — and its answer is shown as
 * a pre-filled suggestion before anything is saved. Every field it guessed
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
}

/**
 * Swedish keyword rules, most specific first. Deliberately local: guessing
 * from a file name costs nothing and gives the user something to correct,
 * whereas sending every dropped file to a model to be classified would be both
 * slower and a decision made somewhere they cannot see.
 */
const CATEGORY_RULES: { category: PropertyDocumentCategory; patterns: RegExp }[] = [
  { category: 'purchase_agreement', patterns: /kopekontrakt|kopebrev|overlatelseavtal|upplatelseavtal|purchase agreement|kontrakt.*bostad/ },
  { category: 'settlement', patterns: /likvidavrakning|slutavrakning|settlement/ },
  { category: 'deposit_agreement', patterns: /handpenning|deposition|depositionsavtal/ },
  { category: 'title_deed', patterns: /lagfart|pantbrev|gravationsbevis|title deed/ },
  { category: 'seller_questionnaire', patterns: /fragelista|saljarens fragelista|questionnaire/ },
  { category: 'inspection', patterns: /besiktning|overlatelsebesiktning|besiktningsprotokoll|radon|fuktmatning|inspection/ },
  { category: 'energy_declaration', patterns: /energideklaration|energiprestanda|energy declaration/ },
  { category: 'tax_assessment', patterns: /taxering|taxeringsbeslut|fastighetsdeklaration|taxeringsvarde/ },
  { category: 'association', patterns: /stadgar|arsredovisning|foreningen|brf|medlemskap|lagenhetsforteckning/ },
  { category: 'insurance', patterns: /forsakring|forsakringsbrev|hemforsakring|villaforsakring|insurance/ },
  { category: 'listing', patterns: /objektsbeskrivning|prospekt|maklarbild|listing/ },
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
 * A first guess at what this document is. Returns 'other' when nothing matches
 * — an honest shrug the user corrects, never a confident wrong answer.
 */
export function guessCategory(fileName: string): PropertyDocumentCategory {
  const haystack = foldForMatch(fileName);
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.test(haystack)) return rule.category;
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
    .select('id, property_id, storage_path, file_name, mime_type, file_size, category, document_date, created_at')
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
    .select('id, property_id, storage_path, file_name, mime_type, file_size, category, document_date, created_at')
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
