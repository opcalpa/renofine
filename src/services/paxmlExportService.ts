/**
 * PAXml Export Service
 *
 * Generates PAXml 2.0 files (Swedish standard for payroll data exchange).
 * Compatible with Fortnox Lön, Hogia Lön, Visma Lön, Björn Lundén, etc.
 *
 * Groups approved time entries by worker for a given period,
 * includes personnummer and hourly rates.
 */

import { supabase } from "@/integrations/supabase/client";
import { formatLocalDate } from "@/lib/dateUtils";

// Swedish payroll transaction codes (lönearter)
const LONEARTER = {
  TIMLON: "11100",     // Timlön — hourly wage
} as const;

interface PaxmlCompanyInfo {
  name: string;
  orgNumber: string;
}

interface PaxmlWorker {
  profileId: string;
  name: string;
  personnummer: string | null;
  entries: {
    date: string;
    hours: number;
    hourlyRate: number;
    projectName: string;
    taskTitle: string | null;
    description: string | null;
  }[];
}

interface PaxmlExportResult {
  content: string;
  filename: string;
  workerCount: number;
  totalHours: number;
  totalAmount: number;
}

/**
 * Generate PAXml payroll file from approved time entries.
 * @param creatorProfileId — the company owner's profile ID
 * @param year — year to export
 * @param month — month to export (1-12)
 */
export async function generatePaxmlExport(
  creatorProfileId: string,
  year: number,
  month: number,
): Promise<PaxmlExportResult | null> {
  // 1. Fetch company info
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, company_name, org_number")
    .eq("id", creatorProfileId)
    .single();

  if (!profile) return null;

  const company: PaxmlCompanyInfo = {
    name: profile.company_name || profile.name || "Företag",
    orgNumber: profile.org_number || "",
  };

  // 2. Fetch all projects owned by this user
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("owner_id", creatorProfileId);

  if (!projects || projects.length === 0) return null;

  const projectIds = projects.map((p) => p.id);
  const projectNames: Record<string, string> = {};
  for (const p of projects) projectNames[p.id] = p.name;

  // 3. Fetch approved time entries for the period
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const periodEnd = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const { data: entries } = await supabase
    .from("time_entries")
    .select("user_id, date, hours, hourly_rate, task_id, project_id, description")
    .in("project_id", projectIds)
    .eq("approved", true)
    .gte("date", periodStart)
    .lt("date", periodEnd)
    .order("date");

  if (!entries || entries.length === 0) return null;

  // 4. Fetch worker profiles (personnummer + default rate).
  // `time_entries.user_id` REFERENCES profiles(id) — it holds a PROFILE id, not
  // an auth user id. Matching it against `profiles.user_id` found nobody, so
  // every entry was skipped below and the export produced an empty file under
  // a green "done" toast.
  const workerProfileIds = [...new Set(entries.map((e) => e.user_id).filter(Boolean))] as string[];
  const { data: workerProfiles } = await supabase
    .from("profiles")
    .select("id, name, personnummer, default_hourly_rate")
    .in("id", workerProfileIds);

  const workerMap: Record<string, { profileId: string; name: string; personnummer: string | null; defaultRate: number }> = {};
  for (const wp of workerProfiles || []) {
    workerMap[wp.id] = {
      profileId: wp.id,
      name: wp.name || "Okänd",
      personnummer: wp.personnummer,
      defaultRate: wp.default_hourly_rate || 0,
    };
  }

  // 5. Fetch task titles
  const taskIds = [...new Set(entries.map((e) => e.task_id).filter(Boolean))] as string[];
  const taskTitles: Record<string, string> = {};
  if (taskIds.length > 0) {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title")
      .in("id", taskIds);
    for (const t of tasks || []) taskTitles[t.id] = t.title;
  }

  // 6. Group entries by worker
  const workers: Record<string, PaxmlWorker> = {};
  for (const entry of entries) {
    const worker = workerMap[entry.user_id];
    if (!worker) continue;

    if (!workers[entry.user_id]) {
      workers[entry.user_id] = {
        profileId: worker.profileId,
        name: worker.name,
        personnummer: worker.personnummer,
        entries: [],
      };
    }

    workers[entry.user_id].entries.push({
      date: entry.date,
      hours: entry.hours,
      hourlyRate: entry.hourly_rate || worker.defaultRate,
      projectName: projectNames[entry.project_id] || "",
      taskTitle: entry.task_id ? (taskTitles[entry.task_id] || null) : null,
      description: entry.description,
    });
  }

  // 7. Generate PAXml
  const workerList = Object.values(workers);
  let totalHours = 0;
  let totalAmount = 0;

  const periodFrom = periodStart;
  const periodTo = formatLocalDate(new Date(year, month, 0)); // Last day of month

  const employeesXml = workerList.map((w, idx) => {
    const txns = w.entries.map((e) => {
      const amount = e.hours * e.hourlyRate;
      totalHours += e.hours;
      totalAmount += amount;
      const comment = [e.projectName, e.taskTitle, e.description].filter(Boolean).join(" — ");
      return `      <Transaction>
        <Code>${LONEARTER.TIMLON}</Code>
        <Amount>${e.hourlyRate.toFixed(2)}</Amount>
        <Quantity>${e.hours.toFixed(2)}</Quantity>
        <Date>${e.date}</Date>${comment ? `\n        <Text>${escapeXml(comment)}</Text>` : ""}
      </Transaction>`;
    }).join("\n");

    return `    <Employee>
      <EmployeeNo>${idx + 1}</EmployeeNo>${w.personnummer ? `\n      <PersonalNo>${escapeXml(w.personnummer)}</PersonalNo>` : ""}
      <Name>${escapeXml(w.name)}</Name>
      <Transactions>
${txns}
      </Transactions>
    </Employee>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PAXml version="2.0">
  <Header>
    <CompanyName>${escapeXml(company.name)}</CompanyName>
    <OrgNo>${escapeXml(company.orgNumber)}</OrgNo>
    <PeriodFrom>${periodFrom}</PeriodFrom>
    <PeriodTo>${periodTo}</PeriodTo>
    <GeneratedDate>${formatLocalDate(new Date())}</GeneratedDate>
    <GeneratedBy>Renofine</GeneratedBy>
  </Header>
  <Employees>
${employeesXml}
  </Employees>
</PAXml>`;

  const monthName = new Date(year, month - 1).toLocaleString("sv-SE", { month: "long" });
  const safeName = company.name.replace(/[^a-zA-Z0-9åäöÅÄÖ]/g, "_").substring(0, 30);
  const filename = `PAXL_${safeName}_${year}_${monthName}.xml`;

  // No matched people means no payroll basis. Returning null sends the caller
  // down its "nothing to export" path rather than handing over an empty file
  // with a success message — the failure mode this function shipped with.
  if (workerList.length === 0) return null;

  return {
    content: xml,
    filename,
    workerCount: workerList.length,
    totalHours,
    totalAmount,
  };
}

/** Download PAXml file in browser */
export function downloadPaxmlFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
