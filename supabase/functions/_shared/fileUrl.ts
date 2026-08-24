import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

/**
 * Signed URLs for the private `project-files` bucket, for edge functions.
 *
 * Functions here run with the service role and answer callers the database
 * cannot authenticate — a worker holding an invite token, a guest filling in an
 * intake form. Those callers can never mint a signed URL themselves, so the
 * function does it for them after it has validated the token.
 *
 * Rows store storage paths; nothing may hand out an `/object/public/` URL.
 */

export const PROJECT_FILES_BUCKET = "project-files";

/** Long enough for a worker to keep a task sheet open through a work session. */
export const DEFAULT_TTL_SECONDS = 60 * 60 * 8;

/** Fields whose string values are file references we sign on the way out. */
const URL_FIELDS = new Set([
  "url",
  "imageUrl",
  "image_url",
  "thumbnail_url",
  "thumbnailUrl",
  "uploaded_url",
  "uploadedUrl",
  "photo_url",
  "photoUrl",
]);

/** Bucket-relative path, or null when the value points somewhere else. */
export function toStoragePath(
  value: unknown,
  bucket = PROJECT_FILES_BUCKET,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!/^https?:\/\//i.test(trimmed)) {
    if (/^(blob:|data:)/i.test(trimmed)) return null;
    return trimmed.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  }

  const marker = new RegExp(
    `/storage/v1/object/(?:public|sign|authenticated)/${bucket}/`,
  );
  const match = trimmed.match(marker);
  if (!match) return null;

  const afterBucket = trimmed.slice((match.index ?? 0) + match[0].length);
  const withoutQuery = afterBucket.split("?")[0];
  try {
    return decodeURIComponent(withoutQuery);
  } catch {
    return withoutQuery;
  }
}

/**
 * Sign many paths at once. Returns a map from the *input* value to a signed
 * URL; values that are not storage references are simply absent.
 */
export async function signPaths(
  sb: SupabaseClient,
  values: Array<unknown>,
  bucket = PROJECT_FILES_BUCKET,
  expiresIn = DEFAULT_TTL_SECONDS,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byPath = new Map<string, string[]>();

  for (const value of values) {
    const path = toStoragePath(value, bucket);
    if (!path) continue;
    const inputs = byPath.get(path);
    if (inputs) inputs.push(value as string);
    else byPath.set(path, [value as string]);
  }
  if (byPath.size === 0) return out;

  const paths = Array.from(byPath.keys());
  const { data, error } = await sb.storage
    .from(bucket)
    .createSignedUrls(paths, expiresIn);
  if (error || !data) return out;

  data.forEach((entry, i) => {
    if (!entry?.signedUrl || entry.error) return;
    for (const input of byPath.get(paths[i]) ?? []) out.set(input, entry.signedUrl);
  });
  return out;
}

/** A voice message stores its file reference inside the comment text itself. */
const VOICE_PREFIX = "🎤 ";

function voiceRef(key: string, value: unknown): string | null {
  if (key !== "content" || typeof value !== "string") return null;
  const i = value.indexOf(VOICE_PREFIX);
  if (i === -1) return null;
  const ref = value.slice(i + VOICE_PREFIX.length).trim();
  return ref || null;
}

function collect(node: unknown, found: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, found);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (URL_FIELDS.has(key) && typeof value === "string") {
        found.add(value);
      } else {
        const ref = voiceRef(key, value);
        if (ref) found.add(ref);
        else collect(value, found);
      }
    }
  }
}

function apply(node: unknown, signed: Map<string, string>): unknown {
  if (Array.isArray(node)) return node.map((item) => apply(item, signed));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (URL_FIELDS.has(key) && typeof value === "string") {
        out[key] = signed.get(value) ?? value;
      } else {
        const ref = voiceRef(key, value);
        const signedRef = ref ? signed.get(ref) : undefined;
        out[key] = signedRef
          ? (value as string).replace(ref as string, signedRef)
          : apply(value, signed);
      }
    }
    return out;
  }
  return node;
}

/**
 * Walk a response payload and replace every file reference with a signed URL,
 * in one signing round. External URLs (a Pexels photo, a vendor's own image)
 * are left untouched, because they are not storage paths.
 *
 * Call this once, on the finished payload, immediately before responding — so
 * a new photo field added later is covered without touching this file.
 */
export async function signPayloadUrls<T>(
  sb: SupabaseClient,
  payload: T,
  bucket = PROJECT_FILES_BUCKET,
  expiresIn = DEFAULT_TTL_SECONDS,
): Promise<T> {
  const found = new Set<string>();
  collect(payload, found);
  if (found.size === 0) return payload;
  const signed = await signPaths(sb, Array.from(found), bucket, expiresIn);
  if (signed.size === 0) return payload;
  return apply(payload, signed) as T;
}
