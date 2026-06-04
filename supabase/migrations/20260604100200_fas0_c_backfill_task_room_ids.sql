-- Fas 0 / Migration C — standardize task<->room linking on room_ids[].
-- room_ids (TEXT[]) was added in 20260308100000; this ensures every task whose legacy
-- scalar room_id is set also carries that id in room_ids[]. Idempotent.
-- The scalar room_id column is intentionally KEPT for now (still read as "primary" room);
-- its eventual removal is a later phase, not Fas 0.
--
-- REVERT: none required — this only appends a value already implied by room_id.

UPDATE tasks
SET room_ids = array_append(coalesce(room_ids, '{}'), room_id::text)
WHERE room_id IS NOT NULL
  AND NOT (coalesce(room_ids, '{}') @> ARRAY[room_id::text]);
