/**
 * Keys that decide whether something has already been imported.
 *
 * Pure functions over values — no supabase import — so they can be reasoned
 * about and tested on their own. The fetching lives in
 * `services/agent/importFingerprint.ts`, its only caller. Same split as
 * `matchPlannedMaterials`.
 */

/** How storage rewrites a name on upload — must mirror smartUploadService. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Strip the upload timestamp from a stored file name.
 * `1787605536722-offert.pdf` → `offert.pdf`
 */
export function originalNameFromStored(storedName: string): string {
  const match = storedName.match(/^\d{10,}-(.+)$/);
  return match ? match[1] : storedName;
}

/**
 * The comparison key for one file: name + byte size.
 *
 * Two different files sharing both is possible in theory; the cost of being
 * wrong is one file skipped, listed under "Fanns redan" where it can be
 * included anyway.
 */
export function fileFingerprint(name: string, size: number): string {
  return `${safeName(name).toLowerCase()}:${size}`;
}

/**
 * A purchase already booked in this project.
 *
 * Vendor + invoice number is the strong key — an invoice number is unique per
 * supplier by definition. Without one (a shop receipt), vendor + date + total
 * is close enough: the same shop, the same day, to the öre.
 */
export interface PurchaseKeySource {
  vendorName: string | null;
  invoiceNumber: string | null;
  total: number | null;
  date: string | null;
}

function normVendor(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Keys this purchase would collide on. Empty when there is nothing solid to
 * match on — a vendor alone must never count, or every purchase from the same
 * shop would look like the same purchase.
 */
export function purchaseKeys(p: PurchaseKeySource): string[] {
  const vendor = normVendor(p.vendorName);
  const keys: string[] = [];
  if (vendor && p.invoiceNumber?.trim()) {
    keys.push(`inv:${vendor}:${p.invoiceNumber.trim().toLowerCase()}`);
  }
  if (vendor && p.total != null && p.date) {
    keys.push(`amt:${vendor}:${p.date}:${Math.round(p.total * 100)}`);
  }
  return keys;
}

/** Same work in the same room is the same task. */
export function taskKey(title: string, roomId: string | null | undefined): string {
  return `${title.trim().toLowerCase().replace(/\s+/g, ' ')}@${roomId ?? ''}`;
}
