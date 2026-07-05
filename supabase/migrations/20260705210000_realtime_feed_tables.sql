-- Enable realtime for the feed tables the clients already subscribe to.
--
-- ProjectChatSection and ProjectFeedTab subscribe to postgres_changes on
-- comments + activity_log, but neither table was ever added to the
-- supabase_realtime publication (only purchase_requests and rooms are), so
-- the subscriptions never fire and the feeds only update on full reload
-- (observed by Cowork loop round 8).
--
-- Revert:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.activity_log;
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.comments;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activity_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
  END IF;
END $$;
