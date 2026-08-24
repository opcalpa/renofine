/**
 * Uppgifter om bostaden — reading facts out of the home's papers (P5).
 *
 * The whole flow is EXPLICIT: a person presses "Läs ut uppgifter" on a document
 * they chose, after a line telling them the document goes to the AI service
 * and that personal numbers are not kept. Nothing runs at upload or at drop.
 * A köpekontrakt names the seller — someone who never agreed to anything with
 * this app — so this is the one place the app does not act first and ask
 * later.
 *
 * Text extraction reuses the folder-ingest engine (one extractor, not two that
 * drift). The model call lives in the `extract-property-document` edge
 * function, which scrubs identifiers before answering; this file scrubs
 * again before storing. Belt and braces, on purpose.
 */

import { extractFileText } from './ingestProjectFolder';
import {
  getPropertyDocumentUrl,
  saveExtractedFacts,
  type PropertyDocument,
  type PropertyDocumentCategory,
  type PropertyFacts,
} from './propertyDocumentService';
import { supabase } from '@/integrations/supabase/client';
import { hasRealAddress, updateProperty, type PropertyRow } from './propertyService';

/**
 * Documents worth reading for facts. A frågelista or an insurance letter says
 * nothing a household needs to look up later; "för alla köpehandlingar" skips
 * them rather than spending a call to learn that.
 */
export const EXTRACTABLE_CATEGORIES: ReadonlySet<PropertyDocumentCategory> = new Set<PropertyDocumentCategory>([
  'purchase_agreement',
  'settlement',
  'title_deed',
  'listing',
  'tax_assessment',
  'energy_declaration',
  'inspection',
  'association',
]);

/**
 * Same pattern as the edge function — Swedish personal numbers by their month
 * digits (01–12), which an organisation number never has. Applied to the JSON
 * text before storage so a leak in any field is caught, whatever its key.
 */
const PNR_PATTERN =
  /\b(?:19|20)?\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]|6[1-9]|[78]\d|9[01])[-+]?\d{4}\b/g;

export function scrubPersonalNumbers(facts: PropertyFacts): PropertyFacts {
  const text = JSON.stringify(facts).replace(PNR_PATTERN, '[borttaget]');
  return JSON.parse(text) as PropertyFacts;
}

export type ExtractResult =
  | { ok: true; facts: PropertyFacts }
  | { ok: false; reason: 'download' | 'unreadable' | 'model' | 'save' };

/**
 * Read one document and store what it said. Status moves none → pending →
 * done/failed so the list can show progress and a failure is never silent.
 */
export async function extractPropertyDocumentFacts(
  doc: PropertyDocument,
  tenureHint?: string | null
): Promise<ExtractResult> {
  await saveExtractedFacts(doc.id, doc.extracted, 'pending');

  const url = await getPropertyDocumentUrl(doc);
  if (!url) {
    await saveExtractedFacts(doc.id, doc.extracted, 'failed');
    return { ok: false, reason: 'download' };
  }

  let file: File;
  try {
    const blob = await (await fetch(url)).blob();
    file = new File([blob], doc.file_name, { type: doc.mime_type ?? blob.type ?? undefined });
  } catch (e) {
    console.error('extractPropertyDocumentFacts: download failed', e);
    await saveExtractedFacts(doc.id, doc.extracted, 'failed');
    return { ok: false, reason: 'download' };
  }

  const text = await extractFileText(file);
  if (!text) {
    await saveExtractedFacts(doc.id, doc.extracted, 'failed');
    return { ok: false, reason: 'unreadable' };
  }

  const { data, error } = await supabase.functions.invoke<{ facts?: PropertyFacts; error?: string }>(
    'extract-property-document',
    { body: { text, category: doc.category, fileName: doc.file_name, tenureHint: tenureHint ?? null } }
  );
  if (error || !data?.facts) {
    console.error('extractPropertyDocumentFacts: model call failed', error ?? data?.error);
    await saveExtractedFacts(doc.id, doc.extracted, 'failed');
    return { ok: false, reason: 'model' };
  }

  const facts = scrubPersonalNumbers(data.facts);
  const saved = await saveExtractedFacts(doc.id, facts, 'done');
  if (!saved) return { ok: false, reason: 'save' };
  return { ok: true, facts };
}

// ── Aggregation for the "Uppgifter om bostaden" card ──────────────────────

/**
 * Which document to believe when two state the same fact. The agreement that
 * transferred the home outranks the listing that advertised it.
 */
const CATEGORY_PRIORITY: Record<PropertyDocumentCategory, number> = {
  purchase_agreement: 0,
  settlement: 1,
  title_deed: 2,
  tax_assessment: 3,
  listing: 4,
  energy_declaration: 5,
  inspection: 6,
  association: 7,
  seller_questionnaire: 8,
  deposit_agreement: 9,
  insurance: 10,
  other: 11,
};

export type FactKey = Exclude<keyof PropertyFacts, 'address'> | 'address';

export interface AggregatedFact<T = unknown> {
  key: FactKey;
  value: T;
  /** The document the shown value comes from. */
  sourceName: string;
  sourceId: string;
  /** Other documents that state a DIFFERENT value — never hidden. */
  conflicts: { sourceName: string; value: T }[];
}

const FACT_KEYS: FactKey[] = [
  'address',
  'purchase_price',
  'contract_date',
  'possession_date',
  'living_area_sqm',
  'build_year',
  'tenure',
  'property_designation',
  'brf_name',
  'brf_org_number',
  'apartment_number',
  'monthly_fee',
];

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Every fact any document stated, one row per fact, with provenance. */
export function aggregateFacts(documents: PropertyDocument[]): AggregatedFact[] {
  const withFacts = documents
    .filter((d) => d.extraction_status === 'done' && d.extracted)
    .sort((a, b) => CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category]);

  const rows: AggregatedFact[] = [];
  for (const key of FACT_KEYS) {
    const holders = withFacts.filter((d) => {
      const v = d.extracted?.[key];
      return v !== null && v !== undefined && v !== '';
    });
    if (holders.length === 0) continue;
    const primary = holders[0];
    const value = primary.extracted![key];
    const conflicts = holders
      .slice(1)
      .filter((d) => !sameValue(d.extracted![key], value))
      .map((d) => ({ sourceName: d.file_name, value: d.extracted![key] }));
    rows.push({ key, value, sourceName: primary.file_name, sourceId: primary.id, conflicts });
  }
  return rows;
}

// ── "Använd" — the ONLY way a fact reaches the property's own fields ──────

/** Fields on the property a fact may be written into, when they are empty. */
export type ApplicableField = 'address' | 'property_designation';

export function canApplyFact(property: PropertyRow, key: FactKey): ApplicableField | null {
  if (key === 'address' && !hasRealAddress(property)) return 'address';
  if (key === 'property_designation' && !property.property_designation?.trim()) return 'property_designation';
  return null;
}

/**
 * Write one fact into the property. Never called without a click; the P1
 * rule ("suggest, never auto") holds here too.
 */
export async function applyFactToProperty(
  property: PropertyRow,
  fact: AggregatedFact
): Promise<boolean> {
  const base = {
    name: property.name,
    address: property.address,
    postalCode: property.postal_code,
    city: property.city,
    propertyDesignation: property.property_designation,
  };
  if (fact.key === 'address') {
    const a = fact.value as PropertyFacts['address'];
    if (!a) return false;
    // A property still named after its project ("Kitchen!") takes the street
    // as its name too, the same way EditPropertyDialog does.
    const generic = !hasRealAddress(property);
    return updateProperty(property.id, {
      ...base,
      name: generic ? a.street : property.name,
      address: a.street,
      postalCode: a.postal_code ?? base.postalCode,
      city: a.city ?? base.city,
    });
  }
  if (fact.key === 'property_designation') {
    return updateProperty(property.id, { ...base, propertyDesignation: String(fact.value) });
  }
  return false;
}
