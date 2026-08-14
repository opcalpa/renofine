# Test checklist — Team v2

Verify each item before considering Team v2 implementation complete.

## Schema migration

- [ ] `01-migration.sql` runs without errors
- [ ] `projects.tracks_economy` exists, default `true`, backfilled correctly
- [ ] `projects.tracks_rot` exists, default `false`
- [ ] `projects.owner_user_type` populated for all existing projects
- [ ] `project_shares.expires_at` column exists
- [ ] `materials.paid_by` FK to profiles, nullable
- [ ] `access_log` table exists with RLS enabled
- [ ] `derive_viewer_mode()` RPC returns correct values for owner, co_owner, client, member, none
- [ ] `get_project_overview()` RPC returns field-masked data per mode

## Persona × mode matrix — manual smoke test

For each combination, verify the user can/cannot see the listed items.

### Worker (token, no login)
- [ ] Sees only `WorkerView` at `/w/<token>`
- [ ] Sees assigned tasks only — not other tasks in same project
- [ ] No "Budget", "Inköp" (other than own), "Team" tabs anywhere
- [ ] `tasks.budget` never visible
- [ ] Can create instruction-image overrides per task

### Klient
- [ ] Sees `CustomerView` instead of `OverviewTab`
- [ ] Sees `contract_value` and `paid_amount` (sum)
- [ ] Sees ROT-section if `tracks_rot === true`
- [ ] Does NOT see other UE prices, markup, marginal
- [ ] Does NOT see internal team comments (only `visible_to_client === true`)
- [ ] Cannot navigate to Budget, Team, Inköp tabs
- [ ] In a project with `tracks_economy === false`: CustomerView goes to "klient-light"-mode (no economy sections)

### UE-medlem · Mode None
- [ ] Sees Overview, Rum, Arbeten, Filer (mina), Tidsplan (om timeline-access)
- [ ] Does NOT see Budget tab
- [ ] Does NOT see Inköp tab as standalone (but can scope own purchases)
- [ ] `tasks.budget` invisible everywhere
- [ ] `materials.price_*` and `vendor_name` invisible
- [ ] `time_logs.hourly_rate` invisible
- [ ] No quick-action buttons for invoice/payment

### UE-medlem · Mode Egna
- [ ] All from Mode None +
- [ ] Sees own materials (created_by_user_id matches) with prices
- [ ] Does NOT see other UE's materials in same room
- [ ] Sees own time logs with own hourly_rate
- [ ] Does NOT see total project budget
- [ ] Does NOT see other UE's time rates

### PM/Co-owner · Mode None
- [ ] Same as UE-medlem Mode None (operative-only)
- [ ] But has admin privs: can invite others, edit project info
- [ ] Budget tab still hidden

### PM/Co-owner · Mode Egna
- [ ] Same as UE-medlem Mode Egna
- [ ] But admin privs: can invite, edit
- [ ] Sees only own invoices/quotes

### PM/Co-owner · Mode Full
- [ ] Sees everything: total_budget, contract_value, est. profit, all rates
- [ ] Sees Budget tab with cost-center breakdown
- [ ] Sees all UE's time logs and rates
- [ ] Sees all materials with prices and vendors
- [ ] Sees marginal/markup if it exists
- [ ] Can invite, edit, manage team

## Project-level toggles

### tracks_economy = false
- [ ] Budget tab hidden for all members (even PM with Mode Full)
- [ ] Mode Full not selectable in wizard
- [ ] No invoice/payment quick-actions on Overview
- [ ] CustomerView shows "klient-light" mode (no economy sections)

### tracks_rot = false (default)
- [ ] No ROT-section on OverviewTab
- [ ] No ROT fields in CreateQuoteDialog / CreateInvoiceDialog
- [ ] No personnummer collection
- [ ] No Skatteverket export option

### owner_user_type = "homeowner"
- [ ] No markup fields anywhere
- [ ] Quote/Invoice dialogs show "direct cost to UE" copy
- [ ] Budget tab doesn't show "Estimerad vinst" or marginal
- [ ] `materials.paid_by` dropdown visible on purchase rows

## Wizard flow

- [ ] Step 1: 4 persona cards render with correct icons/colors
- [ ] PM card expands to show sub-type selector (co_owner / pm_hired)
- [ ] Step 2 (member): Mode picker shows 2 cards (None / Egna)
- [ ] Step 2 (pm): Mode picker shows 3 cards (None / Egna / Full)
- [ ] Step 2 (worker): task picker + instruction images unchanged from v1
- [ ] Step 3: Förhandsgranska-knapp renders mini-preview
- [ ] "Öppna full" → fullscreen overlay
- [ ] Preview field-masks correctly per persona+mode
- [ ] Submit creates share with correct `role_type` and access fields
- [ ] Submit sets `expires_at` if time-bounded chosen
- [ ] Worker submit creates `worker_access_tokens` row
- [ ] DuplicateContactError NO longer thrown when same contact exists in opposite flow (F7)

## TeamTable v2

- [ ] Persona column with color-coded pills (6 distinct colors)
- [ ] Mode column with 4 distinct pills
- [ ] Senast-aktiv column populated from access_log
- [ ] Expires shown below last-active when set
- [ ] Filter pills work: Alla / Aktiva / Workers / Utgångna
- [ ] Förhandsgranska-action (eye icon) opens preview overlay
- [ ] Click on persona-pill opens settings to change role_type
- [ ] Click on mode-pill opens settings to change mode

## Audit log

- [ ] AccessAuditLog renders events from access_log
- [ ] Denied rows highlighted rustSoft
- [ ] Filter pills work
- [ ] `get_project_overview` and other RPCs log views automatically
- [ ] Settings changes log to audit_log

## Bug fixes from del 2

### L1 · files:upload
- [ ] UE-medlem with `files: "upload"` sees upload button in ProjectFilesTab
- [ ] UE-medlem with `files: "view"` does NOT see upload button
- [ ] UE-medlem with `files: "edit"` sees rename/move/delete

### L6 · OverviewTab builder mode
- [ ] UE-medlem (member, not isHomeowner) does NOT see builder-mode pulse cards with est_profit
- [ ] PM/Co-owner sees builder-mode

### L7 · Internal comments
- [ ] Klient and UE-medlem only see comments where `visible_to_client === true`

### L10 · Worker token copy button
- [ ] Hidden for teams:"view"
- [ ] Visible for teams:"invite" (= PM/Co-owner)

## i18n

- [ ] All new strings in `sv/team.json` and `en/team.json`
- [ ] No untranslated keys (no "team.persona.worker.title" appearing in UI)
- [ ] Plurals work correctly ("1 dag kvar" / "30 dagar kvar")

## Regression tests

- [ ] Existing projects still load without errors
- [ ] Existing shares still grant correct access (backward compat)
- [ ] Legacy `package` preset users see "Custom" in TeamTable (since presets are gone)
- [ ] Worker tokens created before migration still work

## Performance

- [ ] `get_project_overview` RPC returns in < 500ms for projects with 100+ tasks
- [ ] TeamTable renders in < 200ms with 20+ team members
- [ ] Audit log query with filter completes in < 300ms

## Security

- [ ] RLS on `access_log` prevents non-owners from reading
- [ ] Field-masking happens at DB level (verify with direct SQL query as non-owner)
- [ ] Expired shares (expires_at < now()) return mode "none" from derive_viewer_mode
- [ ] Worker tokens don't get logged with profile_id (worker_token_id instead)
