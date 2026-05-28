import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CommentInput {
  id: string;
  content: string;
}

/**
 * Translates comment content on demand. The cache lives in-memory per
 * mount; on rerender or remount we re-fetch any missing keys.
 *
 * Default is "translations enabled" so workers and project members land
 * on content in their UI language without an extra click. Consumers
 * trigger `ensureTranslations(comments)` (typically in an effect) when
 * the comment list changes to populate the cache; `toggleTranslations`
 * flips visibility between translated and original.
 */
export function useCommentTranslation() {
  const { t, i18n } = useTranslation();
  const [translationsEnabled, setTranslationsEnabled] = useState(true);
  const [translating, setTranslating] = useState(false);
  const cacheRef = useRef<Map<string, string>>(new Map());

  const targetLang = i18n.language;

  /**
   * Idempotent loader. Filters out already-cached entries before calling
   * the edge function. Safe to call repeatedly with the same input — only
   * uncached ids hit the API.
   */
  const ensureTranslations = useCallback(
    async (comments: CommentInput[]) => {
      const uncached = comments.filter(
        (c) => !cacheRef.current.has(`${c.id}:${targetLang}`)
      );
      if (uncached.length === 0) return;

      setTranslating(true);
      try {
        const { data, error } = await supabase.functions.invoke(
          "translate-comments",
          {
            body: {
              comments: uncached.map((c) => ({ id: c.id, content: c.content })),
              targetLanguage: targetLang,
            },
          }
        );
        if (error) throw error;
        const translations: { id: string; translatedContent: string }[] =
          data?.translations ?? [];
        for (const item of translations) {
          cacheRef.current.set(`${item.id}:${targetLang}`, item.translatedContent);
        }
      } catch (err) {
        console.error("Translation error:", err);
      } finally {
        setTranslating(false);
      }
    },
    [targetLang]
  );

  /**
   * Flip the visibility toggle. When re-enabling, ensure translations
   * exist first so the toggle feels instant.
   */
  const toggleTranslations = useCallback(
    async (comments: CommentInput[]) => {
      if (translationsEnabled) {
        setTranslationsEnabled(false);
        return;
      }
      try {
        await ensureTranslations(comments);
        setTranslationsEnabled(true);
      } catch {
        toast.error(t("comments.translationError", "Could not translate comments"));
      }
    },
    [translationsEnabled, ensureTranslations, t]
  );

  const getTranslatedContent = useCallback(
    (id: string, original: string): string => {
      if (!translationsEnabled) return original;
      return cacheRef.current.get(`${id}:${targetLang}`) ?? original;
    },
    [translationsEnabled, targetLang]
  );

  return {
    translationsEnabled,
    translating,
    toggleTranslations,
    ensureTranslations,
    getTranslatedContent,
    targetLang,
  };
}
