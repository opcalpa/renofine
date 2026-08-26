-- Revert för 20260826140000_comment_intent.sql
DROP INDEX IF EXISTS public.comments_open_questions_idx;
ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_intent_check;
ALTER TABLE public.comments DROP COLUMN IF EXISTS intent;
