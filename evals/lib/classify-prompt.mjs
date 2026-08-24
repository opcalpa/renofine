// Production prompt for classify-document — kept in sync BY HAND with
// supabase/functions/classify-document/index.ts (buildSystemPrompt). The eval
// measures the prompt that ships; if you change one, change the other.
//
// The P1 rules under PROPERTY ADDRESS are the ones this eval exists for.

export function buildClassifySystem() {
  return `You classify renovation project documents. Analyze the document and determine its type.

DOCUMENT TYPES:
- "quote" — A price offer/estimate from a contractor or supplier. Contains line items with prices, work descriptions, totals. Swedish: "Offert", "Prisförslag", "Anbud".
- "invoice" — A bill requesting payment. Has invoice number, due date, OCR/payment reference, bankgiro. Swedish: "Faktura".
- "receipt" — Proof of payment already made. From retail stores, hardware stores. Swedish: "Kvitto", "Kassakvitto".
- "floor_plan" — Architectural drawing, blueprint, or floor plan image. Shows rooms, walls, dimensions. Can be a photo of a printed drawing.
- "contract" — Legal agreement, construction contract, work order. Swedish: "Avtal", "Kontrakt", "Beställning".
- "specification" — Technical specification, material list, scope of work document without prices. Swedish: "Beskrivning", "Specifikation", "Arbetsbeskrivning".
- "product_image" — Photo of a product, material sample, fixture, appliance, or inspiration image.
- "other" — Anything that doesn't fit above categories.

SUGGESTED ACTIONS:
- "extract_tasks" — For quotes, specifications, contracts with work items → extract as tasks with budget
- "extract_purchase" — For invoices, receipts → extract as purchase/material record
- "import_to_canvas" — For floor plans → import as background image on canvas
- "store_only" — For product images, other documents → just save to files

INVOICE/RECEIPT EXTRACTION:
When type is "invoice" or "receipt":
- invoice_date: Extract the invoice date or receipt date as ISO YYYY-MM-DD. Look for "Fakturadatum", "Datum", "Date". Null if not found.
- invoice_amount: Extract the total amount as a number (no currency, no spaces). Look for "Att betala", "Totalt", "Summa", "Total". Null if not extractable.
For other document types, set both to null.

PROPERTY ADDRESS (the address of the HOME the document is about — never the sender's):
- address_source "property_document": the document is ABOUT a property itself — köpekontrakt, köpebrev, överlåtelseavtal, upplåtelseavtal, objektsbeskrivning, besiktningsprotokoll, energideklaration, taxeringsbeslut, lagfart. Extract the object's address ("Objekt", "Fastighet", "Adress", "Lägenhet … på").
- address_source "site_field": a quote, contract, specification or invoice that names WHERE the work is done, in a field like "Objekt", "Arbetsplats", "Arbetsställe", "Leveransadress", "Utförandeadress". Only from such a field.
- address_source null and property_address null in EVERY other case. Receipts ("Kvitto") are ALWAYS null — the address on a receipt is the store's.
- NEVER use the sender's, contractor's, company's, store's or invoice-issuer's address. The letterhead is not the object. If the only address in the document belongs to the company that wrote it, return null.
- property_address: {"street": "Storgatan 5", "postal_code": "114 25", "city": "Stockholm"} — street includes the house number; postal_code/city null when absent. Swedish postal codes are 5 digits, written "114 25".

RULES:
- Be decisive. Pick the most specific type that fits.
- vendor_name: Extract company/store name if visible, null otherwise.
- summary: 1-2 sentences in Swedish describing what the document is.
- confidence: 0.0-1.0

Return ONLY valid JSON:
{
  "type": "invoice",
  "confidence": 0.95,
  "summary": "Faktura från Bauhaus för golvmaterial, totalt 4 500 kr.",
  "vendor_name": "Bauhaus",
  "invoice_date": "2026-03-15",
  "invoice_amount": 4500,
  "suggested_action": "extract_purchase",
  "property_address": {"street": "Storgatan 5", "postal_code": "114 25", "city": "Stockholm"},
  "address_source": "site_field"
}`;
}

// Mirrors the legacy text path in the edge function (the one folder ingest uses).
export function buildClassifyUser(fileName, text) {
  return `File name: "${fileName}". Document text (first 5000 chars):\n\n${text.substring(0, 5000)}\n\nClassify this document.`;
}

// The in-code guard the edge function applies AFTER the model (narrowAddress).
// Copied so the eval scores what ships: prompt + guard, not the prompt alone.
export function applyAddressGuard(type, raw) {
  const none = { property_address: null, address_source: null };
  if (type === "receipt" || type === "product_image" || type === "floor_plan") return none;
  const source = raw.address_source;
  if (source !== "property_document" && source !== "site_field") return none;
  const a = raw.property_address;
  if (!a || typeof a !== "object") return none;
  const street = typeof a.street === "string" ? a.street.trim() : "";
  if (!street || !/\d/.test(street)) return none;
  return {
    property_address: {
      street,
      postal_code: typeof a.postal_code === "string" && a.postal_code.trim() ? a.postal_code.trim() : null,
      city: typeof a.city === "string" && a.city.trim() ? a.city.trim() : null,
    },
    address_source: source,
  };
}
