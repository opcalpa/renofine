# Component-level changes — Team v2

This document lists every file that needs to be created, modified, or deleted
to implement Team v2 against the existing Renofine codebase.

Status legend:
- 🆕 **Create** — new file
- ✏️ **Modify** — existing file, see notes
- 🗑️ **Delete** — remove after migration complete
- ⏸️ **Defer** — keep for now, mark @deprecated

---

## Phase 1 · Foundation

### Schema &amp; types
- ✏️ Run `01-migration.sql` against Supabase
- ✏️ Regenerate `src/integrations/supabase/types.ts` via `supabase gen types`
- 🆕 `src/integrations/supabase/v2-rpcs.ts` — TypeScript helpers for the new RPCs (or extend `types.ts` Database type)

### Service layer
- 🆕 `src/services/projectDataService.ts` — copy from `03-projectDataService.ts`
- 🆕 `src/services/auditLogService.ts` — split out audit helpers if file gets big

### Hooks to refactor
- ✏️ `src/hooks/useProjectPermissions.ts` — add `mode: ViewerMode` field, derive via new RPC instead of computing from raw share fields
- ✏️ `src/components/project/overview/useOverviewData.ts` — route through `getProjectOverview()` RPC
- ✏️ `src/hooks/useTasksData.ts` — route through `getProjectTasks()` RPC
- ✏️ `src/components/project/MaterialsList.tsx` — route through `getProjectMaterials()` RPC

### New hooks
- 🆕 `src/hooks/useLastActive.ts` — query access_log
- 🆕 `src/hooks/usePreviewAsPersona.ts` — for InvitePreviewOverlay

---

## Phase 2 · Wizard refactor

### Type definitions
- ✏️ `src/components/project/team/invite-wizard/types.ts`:
  - Rename `InvitePath` → `InvitePersona = "worker" | "client" | "member" | "pm"`
  - Add `EconomyMode = "none" | "own" | "full"`
  - Add `ScopeRule = "assigned" | "all" | "by_room" | "by_tag"`
  - Update `InviteWizardState` shape (drop `MemberAccessConfig.preset`, add `mode`, `scope`, `pmSubType`)

### Replace package logic
- 🗑️ `src/components/project/team/invite-wizard/packageToAccess.ts` — delete
- 🆕 `src/components/project/team/invite-wizard/personaToAccess.ts` — copy from `02-personaToAccess.ts`

### Wizard state hook
- ✏️ `src/components/project/team/invite-wizard/useInviteWizard.ts`:
  - Replace `setPath`/`setProfession`/`setPackagePreset` with `setPersona`/`setMode`/`setScope`/`setPmSubType`
  - Replace `setAccessField` (manual matrix) with declarative mode
  - Keep worker-specific helpers (`toggleWorkerTask`, `setWorkerOverride`, etc.)

### Steps
- ✏️ `WizardStep1Path.tsx` → rename to `WizardStep1Persona.tsx`:
  - Render 4 persona cards in 2×2 grid
  - PM card has expandable sub-type selector (co_owner / pm_hired)
- 🆕 `WizardStep2Member.tsx` (replaces `WizardStep3Member.tsx`):
  - Profession pill row
  - Scope picker (4 cards)
  - Mode picker (2 cards: None / Egna)
  - Purchase toggles
- 🆕 `WizardStep2PM.tsx`:
  - Relation (co_owner / pm_hired)
  - Mode picker (3 cards: None / Egna / Full)
  - Extended permissions toggles
  - Time-bound (Permanent / Hela projektet / 90 dagar / Egen)
- ✏️ `WizardStep3Worker.tsx` — keep mostly as is, just route from new step-1
- ✏️ `WizardStep4Contact.tsx` → rename to `WizardStep3Contact.tsx`:
  - Widen to 720px when 2-col preview shown
  - Add `<InvitePreviewOverlay />` in right column

### Submit logic
- ✏️ `submitInvite.ts`:
  - Update `submitMember()` to call `personaToAccess(persona, mode, scope)` instead of using `state.memberAccess.access` directly
  - Set `expires_at` from `state.expiresAt` on share insert
  - Set `role_type` from persona+pmSubType (`co_owner`, `pm_hired`, `member`, `client`)
  - Tolerate cross-flow duplicates (F7 — don't throw DuplicateContactError when matching contact exists in opposite flow)

### Replace InviteWorkerDialog
- ⏸️ `src/components/project/team/InviteWorkerDialog.tsx` — mark `@deprecated`, route all call-sites to `InviteWizard` with `initialPath="worker"` + `skipStep1=true`
- Migrate `generateChecklists` logic from InviteWorkerDialog into `WizardStep3Worker`
- Migrate WhatsApp-share button from InviteWorkerDialog
- After both above: 🗑️ delete InviteWorkerDialog

### New: preview overlay
- 🆕 `src/components/project/team/invite-wizard/InvitePreviewOverlay.tsx`:
  - Mini-preview (embedded in step 3, ~360px tall)
  - Full preview (modal overlay, fullscreen) triggered by "Öppna full"-knapp
  - Renders Översikt + a sample task + Inköp using `getProjectAsPersona()` RPC
  - Shows visible/hidden tabs explicitly at the bottom

---

## Phase 3 · TeamTable v2

### Modify table
- ✏️ `src/components/project/team/TeamTable.tsx`:
  - Add **Persona** column (between Name and Role)
    - Color-coded pill mapping `role_type` to label + color
    - Color map: see README §6 (TeamTable v2)
  - Add **Mode** column (between Role and Contact)
    - Mono-pill: "Full ekonomi" / "Egna belopp" / "Inga belopp" / "Klientvy"
    - Click opens settings dropdown for that share
  - Add **Senast aktiv** column (after Contact)
    - Use `useLastActive(profileId, projectId)` hook
  - Show `expires_at` under last-active when set
  - Add **Förhandsgranska som** action (eye icon) in actions column
  - Filter pills above table: "Alla" / "Aktiva" / "Workers" / "Utgångna"

### New: audit log
- 🆕 `src/components/project/team/AccessAuditLog.tsx`:
  - List events from `getAuditLog()`
  - Filter pills: Alla / Sidvisningar / Filer / Inställningar / Nekad åtkomst
  - Highlight denied rows with rustSoft background
  - Show as a separate sub-tab under the Team tab

### TeamManagement entry point
- ✏️ `src/components/project/TeamManagement.tsx`:
  - Add sub-tab switcher: "Team" (default) / "Audit"
  - Mount `AccessAuditLog` for Audit sub-tab
  - Add "Förhandsgranska som…"-button in top action bar
  - Add filter pills above table

---

## Phase 4 · Project setup

### CreateProjectDialog
- ✏️ `src/components/project/CreateProjectDialog.tsx`:
  - Widen to 920px (2-column layout)
  - Left col: existing fields (name, address, etc.)
  - Right col:
    - "Track ekonomi i Renofine"-toggle (controls `projects.tracks_economy`)
    - "Använd ROT-avdrag"-toggle (controls `projects.tracks_rot`, default off)
    - "Vem äger projektet?" — 2 cards: Jag (proffs) / Jag (hemägare)
      - Sets `projects.owner_user_type`
      - Hemägare default makes tracks_economy = false
  - Submit logic: insert with new columns

### Effects of new toggles
- ✏️ `ProjectDetail.tsx`:
  - If `tracks_economy === false`: hide Budget tab, hide quick-action buttons for invoice/payment
  - If `tracks_rot === false`: hide ROT section in OverviewTab, hide ROT fields in invoice/quote dialogs
  - If `owner_user_type === "homeowner"`: hide markup fields in Budget tab, change copy in Quotes/Invoices

---

## Phase 5 · Bug fixes from del 2 (L1–L10)

### L1 · files:"upload" dead code
- ✏️ `src/pages/ProjectDetail.tsx`, line 1306:
  - Change `canEdit={permissions.files === "edit"}` to `filesAccess={permissions.files}`
- ✏️ `src/components/project/ProjectFilesTab.tsx`:
  - Accept `filesAccess: "none" | "view" | "upload" | "edit"` prop
  - Render upload button if `filesAccess in ["upload", "edit"]`
  - Render rename/move/delete if `filesAccess === "edit"`

### L2 · Default teams:"view" gone via personaToAccess
- ✅ Already handled in `personaToAccess.ts` — UE-medlem gets `teams: "none"` by default

### L3-L10 · Field-masking via service layer
- ✅ All resolved via `getProjectOverview` + `getProjectTasks` + `getProjectMaterials` RPCs
- Verify each leak from del 2 in `05-test-checklist.md`

---

## Phase 6 · Cleanup

- 🗑️ Delete `packageToAccess.ts` (replaced by `personaToAccess.ts`)
- 🗑️ Delete `InviteWorkerDialog.tsx` (replaced by InviteWizard worker path)
- ✏️ Update all i18n strings (sv + en) — many new keys for personas, modes, audit-log
- ✏️ Update `src/lib/projectStatus.ts` `getTabVisibility()` to consider `tracks_economy`
- ✏️ Update `src/i18n/locales/sv/*.json` + `en/*.json` with new translation keys

---

## File count summary

| Phase | Create | Modify | Delete |
|---|---|---|---|
| 1 · Foundation | 3 | 6 | 0 |
| 2 · Wizard | 3 | 6 | 1 (after migration) |
| 3 · TeamTable | 1 | 2 | 0 |
| 4 · Project setup | 0 | 2 | 0 |
| 5 · Bug fixes | 0 | 2 | 0 |
| 6 · Cleanup | 0 | 3 | 2 |
| **Total** | **7** | **21** | **3** |

---

## Recommended PR sequence

To minimize blast radius and keep PRs reviewable:

1. **PR-1: Schema + service layer** (Phase 1) — pure backend, no UI changes
2. **PR-2: personaToAccess** (Phase 2 first half) — drop-in replacement for packageToAccess, no visible changes
3. **PR-3: Wizard refactor** (Phase 2 second half) — visible UI changes start here
4. **PR-4: TeamTable v2** (Phase 3) — new columns + audit log
5. **PR-5: Project setup toggles** (Phase 4)
6. **PR-6: L1 fix + cleanup** (Phase 5 + 6)

Each PR can be merged independently — no breaking dependencies after PR-1.
