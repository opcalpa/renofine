-- Worker messages are the BUILDER's, not the builder's customer's.
--
-- comments.visible_to_client defaults to true and none of the worker edge
-- functions (worker-send-message, worker-ask-question, worker-upload-photo)
-- ever set it. A painter's "is this pipe ok?" therefore surfaced in the
-- client's feed as soon as the client could see Tasks — and the client could
-- answer something meant for the builder.
--
-- The functions now write visible_to_client = false. This closes the rows that
-- were already written. Workers are identified the same way the feed does it:
-- author_display_name carries the ' (worker)' suffix, set by every worker
-- function and by nothing else.
--
-- Revert:
--   UPDATE public.comments SET visible_to_client = true
--   WHERE author_display_name LIKE '% (worker)';

UPDATE public.comments
SET visible_to_client = false
WHERE author_display_name LIKE '% (worker)'
  AND visible_to_client IS DISTINCT FROM false;
