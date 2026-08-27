-- Close the anon door on ÄTA approval tokens.
--
-- The approval page used to read and write this table directly as `anon`
-- under USING (true). The anon key ships in every browser bundle, so anyone
-- could list every approval token in the database and approve or reject any
-- ÄTA in it. The link was never the gate.
--
-- Approval now goes through the `ata-approval` edge function (service role,
-- looked up BY TOKEN). Nothing anonymous needs to touch this table any more.
--
-- Applied AFTER the new frontend is live: the old bundle read the table
-- directly, and pulling the policies first would have broken every approval
-- link in flight.

drop policy if exists "ata_tokens_anon_select" on public.ata_approval_tokens;
drop policy if exists "ata_tokens_anon_update" on public.ata_approval_tokens;
drop policy if exists "tasks_anon_ata_update" on public.tasks;
