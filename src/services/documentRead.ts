import { supabase } from "@/integrations/supabase/client";
import { normalizeForReading, type ImageRotation } from "@/lib/imageNormalize";

/**
 * Read a photographed receipt/invoice the right way up.
 *
 * One implementation, three callers (folder import, camera capture, link-a-
 * purchase), because the failure this fixes is invisible: a sideways receipt is
 * not read badly, it is read CONFIDENTLY WRONG. Two copies of this would drift,
 * and the copy that drifts is the one nobody re-reads.
 *
 * HOW, and why not the obvious way (all measured on Carl's pile, 2026-09-03):
 *
 *   The obvious design is to ask the model how far to turn the image. It does
 *   not work. Across five receipts that all needed 270°, asked for degrees
 *   clockwise it answered 90, 180, 180, 0, 180 — it noticed four of the five
 *   were lying wrong and named the angle right zero times. Asked instead where
 *   the document's top edge sat, it did worse: three came back "upright", one
 *   of them with an invented "ICA, 1039,35 kr".
 *
 *   So the model is asked only the part it can do — "is this text upright?" —
 *   and the app finds the angle by TRYING. What decides whether an attempt is
 *   good is not the model's confidence, which is exactly the thing that lied
 *   (0.72 on a fabricated ICA total), but `verifyReceipt`: net + VAT = gross,
 *   VAT is a legal Swedish rate, the lines add up, the printed total matches.
 *   Arithmetic the model cannot argue with, computed server-side and returned
 *   as `issues`.
 *
 * Cost: one call when the photo is already straight, two for the common
 * phone-on-a-table case, four at worst. Only images the classifier already
 * called a receipt or invoice ever get here, so the worst case is rare.
 */

/**
 * Tried in this order, and the first TWO are always tried.
 *
 * Always reading 0° and 270° costs one extra call per photo and buys the one
 * hole the yes/no question leaves open: of five receipts read flat, four
 * correctly answered "not upright" and returned nulls — the fifth claimed it
 * was upright and produced "BAUHAUS, 1380,65 kr" for a Hornbach receipt of
 * 496,80. A model that is wrong about whether it can read something cannot be
 * the only thing deciding when to stop looking. Turned 270° the same file read
 * 496,80 / 99,36 / 2026-01-16 with all six lines, so the comparison settles it.
 *
 * 270° is second because a receipt photographed on a table overwhelmingly needs
 * it; 90° and 180° are only reached when neither of the first two closes.
 */
const ROTATIONS: ImageRotation[] = [0, 270, 90, 180];
const ALWAYS_TRY = 2;

export interface UprightReadable {
  document_type?: string;
  text_is_upright?: boolean;
  receiptData?: {
    vendor_name: string | null;
    total_amount: number | null;
    confidence?: number;
    issues?: { level: "check" | "blocking"; code: string }[];
  } | null;
}

export interface UprightRead<T> {
  /** The best reading found, or null if the endpoint answered with nothing. */
  data: T | null;
  /** The image that reading came from — upright and capped. Archive THIS. */
  sent: File;
  /** Degrees the image had to turn. 0 when it was already straight. */
  rotationApplied: ImageRotation;
  /** How many model calls it took. Worth logging: it is the cost of this fix. */
  attempts: number;
}

/**
 * Rank one attempt. Higher is better; `good` means stop looking.
 *
 * Deliberately NOT the model's confidence — that is the number that was 0.72 on
 * an invented receipt. Everything here is either a hard fact (is there a vendor)
 * or arithmetic the server checked.
 */
function rank(data: AttemptData): { score: number; good: boolean } {
  const r = data?.receiptData;
  if (!r) return { score: 0, good: false };
  const hasVendor = !!r.vendor_name?.trim();
  const hasTotal = (r.total_amount ?? 0) > 0;
  if (!hasVendor && !hasTotal) return { score: 0, good: false };

  const issues = r.issues ?? [];
  const blocking = issues.filter((i) => i.level === "blocking").length;
  const arithmeticOff = issues.filter((i) =>
    i.code === "vat_rate_off" ||
    i.code === "line_sum_mismatch" ||
    i.code === "printed_total_differs" ||
    i.code === "vat_exceeds_total",
  ).length;
  const checks = issues.length - blocking - arithmeticOff;

  const score =
    (hasVendor ? 10 : 0) +
    (hasTotal ? 10 : 0) +
    (data?.text_is_upright === false ? -20 : 0) -
    blocking * 8 -
    arithmeticOff * 6 -
    checks;

  // Good enough to stop: it read the two fields the row cannot exist without,
  // the model says the text was upright, and the arithmetic closes.
  const good =
    hasVendor && hasTotal && data?.text_is_upright !== false && blocking === 0 && arithmeticOff === 0;
  return { score, good };
}

type AttemptData = UprightReadable | null;

export async function readDocumentUpright<T extends UprightReadable>(
  file: File,
  opts?: { userNote?: string },
): Promise<UprightRead<T>> {
  const isPdf =
    (file.type || "").toLowerCase().includes("pdf") ||
    file.name.toLowerCase().endsWith(".pdf");
  const userNote = opts?.userNote?.trim() || undefined;

  const read = async (f: File): Promise<T | null> => {
    const base64 = await fileToBase64(f);
    const { data, error } = await supabase.functions.invoke<T>("process-document-v2", {
      body: isPdf
        ? { fileBase64: base64, mimeType: f.type || "application/pdf", fileName: f.name, mode_hint: "receipt", userNote }
        : { imageBase64: base64, mimeType: f.type || "image/jpeg", fileName: f.name, mode_hint: "receipt", userNote },
    });
    if (error) throw new Error(error.message || "Document analysis failed");
    return data;
  };

  // A PDF carries its own page geometry — pass it through untouched.
  if (isPdf) {
    return { data: await read(file), sent: file, rotationApplied: 0, attempts: 1 };
  }

  let best: { data: T | null; sent: File; rotation: ImageRotation; score: number } | null = null;
  let attempts = 0;

  for (const [index, rotation] of ROTATIONS.entries()) {
    const image = await normalizeForReading(file, rotation);
    // Normalisation failed (returned the original) — there is nothing to turn,
    // so trying the other angles would just repeat the same call.
    if (image === file && rotation !== 0) break;

    let data: T | null = null;
    try {
      data = await read(image);
      attempts += 1;
    } catch (e) {
      // The first failure is the caller's problem; a later one just ends the
      // search with whatever we already have.
      if (!best) throw e;
      break;
    }

    const { score, good } = rank(data);
    if (!best || score > best.score) best = { data, sent: image, rotation, score };

    // Past the two we always read, a closing arithmetic ends the search.
    if (good && index + 1 >= ALWAYS_TRY) break;

    // The document is not a receipt at all (a drawing, a photo of a wall) — but
    // only believe that once the image has been the right way up at least once.
    const notAReceipt = data?.document_type === "quote" || data?.document_type === "scope";
    if (notAReceipt && index + 1 >= ALWAYS_TRY) break;
  }

  if (!best) return { data: null, sent: file, rotationApplied: 0, attempts };
  return { data: best.data, sent: best.sent, rotationApplied: best.rotation, attempts };
}

export function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
