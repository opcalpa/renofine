/**
 * invoiceSourcesService — det ett byggföretag faktiskt fakturerar.
 *
 * Fram till nu kunde en faktura bara komma från en offert. Timmarna som
 * hantverkaren rapporterar i fält, materialet som köpts in och den ÄTA kunden
 * godkänt gick inte att fakturera — `tasks.ata_status = "approved"` var en
 * återvändsgränd, och `time_entries` nämndes inte en enda gång i
 * fakturaskaparen. Det är hela poängen med att registrera timmar.
 *
 * Dubbelfakturering är den farliga felriktningen, så "redan fakturerad" avgörs
 * av om det FINNS en fakturarad som pekar på källan (unikt index i databasen),
 * inte av en flagga någon måste komma ihåg att sätta.
 */
import { supabase } from "@/integrations/supabase/client";

export type InvoiceSourceKind = "hours" | "material" | "ata";

export interface InvoiceSourceCandidate {
  kind: InvoiceSourceKind;
  /** Källans id — time_entries.id, materials.id eller tasks.id. */
  sourceId: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  /** Radsumma ex moms. */
  total: number;
  /** Datum källan hör till, för sortering och gruppering. */
  date: string | null;
  /** Uppgiften källan hör till, när den finns. */
  taskId: string | null;
  taskTitle: string | null;
  /** ROT-berättigad? Arbete är det ofta, material aldrig. */
  rotEligible: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Hämtar allt som går att fakturera i projektet och som inte redan sitter på en
 * fakturarad.
 *
 * Reglerna per källa:
 * - **Timmar:** bara GODKÄNDA. En orapporterad eller nekad timme är inte ett
 *   betalkrav, och att fakturera den vore att fakturera något byggaren själv
 *   inte har godkänt.
 * - **Material:** bara beställt, fakturerat till oss eller betalt. Ett önskemål,
 *   ett förslag eller en pausad rad har inte kostat något ännu. (`delivered`
 *   finns inte i `materials.status` — det är inköpsorderns vokabulär.)
 * - **ÄTA:** bara den kunden faktiskt har godkänt (`ata_status = "approved"`).
 *   Det är hela skillnaden mellan ett tillägg och en tvist.
 */
export async function fetchInvoiceSources(
  projectId: string,
): Promise<InvoiceSourceCandidate[]> {
  const [hoursRes, materialsRes, ataRes, usedRes] = await Promise.all([
    supabase
      .from("time_entries")
      .select("id, date, hours, hourly_rate, description, task_id, tasks(title)")
      .eq("project_id", projectId)
      .eq("approved", true)
      .is("declined_at", null)
      .order("date"),
    supabase
      .from("materials")
      .select("id, name, quantity, unit, price_per_unit, price_total, markup_percent, status, created_at, task_id, tasks(title)")
      .eq("project_id", projectId)
      .in("status", ["ordered", "billed", "paid"])
      .order("created_at"),
    supabase
      .from("tasks")
      .select("id, title, budget, estimated_hours, hourly_rate, ata_status, ata_approved_at")
      .eq("project_id", projectId)
      .eq("ata_status", "approved")
      .order("ata_approved_at"),
    supabase
      .from("invoice_items")
      .select("source_time_entry_id, source_material_id, source_ata_task_id"),
  ]);

  // Ett tyst frågefel är precis hur "ingenting konsumerar en godkänd ÄTA" kunde
  // överleva: listan blir tom och ser ut som att det inte fanns något underlag.
  // Verifierat 2026-08-27 — `tasks.subcontractor_cost` finns inte, och frågan
  // returnerade noll rader utan ett ljud.
  for (const [name, res] of [
    ["timmar", hoursRes],
    ["material", materialsRes],
    ["ÄTA", ataRes],
    ["fakturerade rader", usedRes],
  ] as const) {
    if (res.error) {
      throw new Error(`Kunde inte hämta ${name}: ${res.error.message}`);
    }
  }

  const usedHours = new Set<string>();
  const usedMaterials = new Set<string>();
  const usedAta = new Set<string>();
  for (const row of usedRes.data ?? []) {
    if (row.source_time_entry_id) usedHours.add(row.source_time_entry_id);
    if (row.source_material_id) usedMaterials.add(row.source_material_id);
    if (row.source_ata_task_id) usedAta.add(row.source_ata_task_id);
  }

  const out: InvoiceSourceCandidate[] = [];

  for (const te of hoursRes.data ?? []) {
    if (usedHours.has(te.id)) continue;
    const hours = Number(te.hours ?? 0);
    const rate = Number(te.hourly_rate ?? 0);
    if (hours <= 0) continue;
    const taskTitle = (te.tasks as { title?: string } | null)?.title ?? null;
    out.push({
      kind: "hours",
      sourceId: te.id,
      description: te.description?.trim() || taskTitle || "Arbetad tid",
      quantity: hours,
      unit: "tim",
      unitPrice: rate,
      total: round2(hours * rate),
      date: te.date ?? null,
      taskId: te.task_id ?? null,
      taskTitle,
      // Arbete är ROT-berättigat, material aldrig. Byggaren kan ändra på raden.
      rotEligible: true,
    });
  }

  for (const m of materialsRes.data ?? []) {
    if (usedMaterials.has(m.id)) continue;
    const qty = Number(m.quantity ?? 1) || 1;
    const base = m.price_total != null ? Number(m.price_total) : Number(m.price_per_unit ?? 0) * qty;
    if (!Number.isFinite(base) || base === 0) continue;
    // Påslaget är byggarens marginal och hör till det kunden faktureras.
    const markup = Number(m.markup_percent ?? 0);
    const total = round2(base * (1 + markup / 100));
    const taskTitle = (m.tasks as { title?: string } | null)?.title ?? null;
    out.push({
      kind: "material",
      sourceId: m.id,
      description: m.name || "Material",
      quantity: qty,
      unit: m.unit || "st",
      unitPrice: round2(total / qty),
      total,
      date: m.created_at ? m.created_at.slice(0, 10) : null,
      taskId: m.task_id ?? null,
      taskTitle,
      rotEligible: false,
    });
  }

  for (const task of ataRes.data ?? []) {
    if (usedAta.has(task.id)) continue;
    // ÄTA-beloppet: budgeten om den är satt, annars timmar × timpris.
    const amount =
      Number(task.budget ?? 0) ||
      Number(task.estimated_hours ?? 0) * Number(task.hourly_rate ?? 0) ||
      0;
    if (amount <= 0) continue;
    out.push({
      kind: "ata",
      sourceId: task.id,
      description: task.title || "ÄTA",
      quantity: 1,
      unit: "st",
      unitPrice: amount,
      total: round2(amount),
      date: task.ata_approved_at ? task.ata_approved_at.slice(0, 10) : null,
      taskId: task.id,
      taskTitle: task.title ?? null,
      rotEligible: true,
    });
  }

  return out;
}
