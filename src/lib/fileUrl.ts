import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Signed URLs for private storage buckets.
 *
 * `project-files` is private: every receipt, quote, drawing and photo is only
 * reachable through a short-lived signed URL minted for a caller that RLS has
 * already cleared. Nothing in the app may build an `/object/public/` URL for it.
 *
 * Callers pass either a storage path or a legacy public URL — rows written
 * before the bucket was closed still hold full URLs, so `toStoragePath` folds
 * both into a path before signing.
 */

export const PROJECT_FILES_BUCKET = "project-files";

/** Buckets that are public on purpose: avatars and company logos are shown to
 *  signed-out visitors on the landing page and on shared quotes. */
const PUBLIC_BY_DESIGN = new Set(["avatars", "company-logos"]);

const DEFAULT_TTL_SECONDS = 3600;
/** Re-sign once a URL is this far through its life, so a long-lived tab never
 *  renders an expired link. */
const REFRESH_RATIO = 0.8;

export interface FileTransform {
  width?: number;
  height?: number;
  resize?: "cover" | "contain" | "fill";
  quality?: number;
}

export interface FileUrlOptions {
  bucket?: string;
  transform?: FileTransform;
  expiresIn?: number;
  /** Prompt a download instead of rendering inline; pass the filename to use. */
  download?: string | boolean;
}

interface CacheEntry {
  url: string;
  refreshAfter: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(bucket: string, path: string, opts: FileUrlOptions): string {
  const t = opts.transform;
  const transformKey = t ? `${t.width ?? ""}x${t.height ?? ""}:${t.resize ?? ""}:${t.quality ?? ""}` : "";
  const downloadKey = opts.download === undefined ? "" : String(opts.download);
  return `${bucket}|${path}|${transformKey}|${downloadKey}`;
}

/**
 * Normalise a stored value to a bucket-relative storage path.
 *
 * Accepts a bare path, a legacy `/object/public/<bucket>/…` URL, or an already
 * signed `/object/sign/<bucket>/…` URL. Returns null for anything that points
 * somewhere else entirely (an external image, a blob/data URI) — those must be
 * used as-is rather than signed.
 */
export function toStoragePath(value: string | null | undefined, bucket = PROJECT_FILES_BUCKET): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!/^https?:\/\//i.test(trimmed)) {
    // Already a path. Collapse accidental double slashes — a leading "/" or a
    // "projects//<id>" from string concatenation makes storage miss the object
    // while listing still succeeds.
    return trimmed.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  }

  const marker = new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/`);
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

/** True when the value is a URL we should hand to an <img>/<a> untouched. */
export function isExternalUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^(blob:|data:)/i.test(value) || (/^https?:\/\//i.test(value) && toStoragePath(value) === null);
}

/**
 * Mint (or reuse) a signed URL for one file.
 *
 * Returns null when the caller is not allowed to read the object — RLS decides,
 * and a denied signature must render as "no image", never as a broken public
 * link. Concurrent callers for the same file share one request.
 */
export async function getFileUrl(
  pathOrUrl: string | null | undefined,
  options: FileUrlOptions = {}
): Promise<string | null> {
  if (!pathOrUrl) return null;

  const bucket = options.bucket ?? PROJECT_FILES_BUCKET;

  // Buckets that are public on purpose keep their public URL: they are meant to
  // load for signed-out visitors, where signing would fail.
  if (PUBLIC_BY_DESIGN.has(bucket)) {
    const path = toStoragePath(pathOrUrl, bucket);
    if (!path) return pathOrUrl;
    return supabase.storage.from(bucket).getPublicUrl(path, { transform: options.transform }).data.publicUrl;
  }

  if (isExternalUrl(pathOrUrl)) return pathOrUrl;

  const path = toStoragePath(pathOrUrl, bucket);
  if (!path) return null;

  const key = cacheKey(bucket, path, options);
  const cached = cache.get(key);
  if (cached && Date.now() < cached.refreshAfter) return cached.url;

  const pending = inflight.get(key);
  if (pending) return pending;

  const expiresIn = options.expiresIn ?? DEFAULT_TTL_SECONDS;
  const request = (async () => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn, {
        transform: options.transform,
        download: options.download,
      });

    if (error || !data?.signedUrl) {
      cache.delete(key);
      return null;
    }
    cache.set(key, {
      url: data.signedUrl,
      refreshAfter: Date.now() + expiresIn * REFRESH_RATIO * 1000,
    });
    return data.signedUrl;
  })();

  inflight.set(key, request);
  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}

/**
 * Sign many files in one round trip. Returns a map keyed by the *input* value
 * so callers can look results up with whatever they passed in.
 *
 * Transforms are per-file in the single-URL API only, so a thumbnail grid still
 * goes through `getFileUrl`; this batch path is for full-size links.
 */
export async function getFileUrls(
  pathsOrUrls: Array<string | null | undefined>,
  options: Omit<FileUrlOptions, "transform"> = {}
): Promise<Map<string, string>> {
  const bucket = options.bucket ?? PROJECT_FILES_BUCKET;
  const result = new Map<string, string>();

  const needed: Array<{ input: string; path: string; key: string }> = [];
  for (const value of pathsOrUrls) {
    if (!value) continue;
    if (result.has(value)) continue;

    if (PUBLIC_BY_DESIGN.has(bucket) || isExternalUrl(value)) {
      const url = await getFileUrl(value, options);
      if (url) result.set(value, url);
      continue;
    }

    const path = toStoragePath(value, bucket);
    if (!path) continue;

    const key = cacheKey(bucket, path, options);
    const cached = cache.get(key);
    if (cached && Date.now() < cached.refreshAfter) {
      result.set(value, cached.url);
      continue;
    }
    needed.push({ input: value, path, key });
  }

  if (needed.length === 0) return result;

  const expiresIn = options.expiresIn ?? DEFAULT_TTL_SECONDS;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(needed.map((n) => n.path), expiresIn);

  if (error || !data) return result;

  // createSignedUrls answers positionally, and reports per-file failure inline.
  data.forEach((entry, i) => {
    const target = needed[i];
    if (!target || !entry?.signedUrl || entry.error) return;
    cache.set(target.key, {
      url: entry.signedUrl,
      refreshAfter: Date.now() + expiresIn * REFRESH_RATIO * 1000,
    });
    result.set(target.input, entry.signedUrl);
  });

  return result;
}

/**
 * Sign the `url` field of a set of rows in one round trip.
 *
 * Photo rows store storage paths, so signing belongs in the data layer: every
 * surface that renders `photo.url` then works unchanged, and a new one cannot
 * forget to sign. Rows whose url is external (a Pexels image, a vendor's own
 * link) are returned untouched.
 */
export async function signRows<T extends object>(
  rows: T[] | null | undefined,
  options: Omit<FileUrlOptions, "transform"> = {}
): Promise<T[]> {
  if (!rows || rows.length === 0) return rows ?? [];
  const urlOf = (row: T): string | null => {
    const value = (row as { url?: unknown } | null)?.url;
    return typeof value === "string" ? value : null;
  };
  const signed = await getFileUrls(rows.map(urlOf), options);
  if (signed.size === 0) return rows;
  return rows.map((row) => {
    const current = urlOf(row);
    const url = current ? signed.get(current) : undefined;
    return url ? { ...row, url } : row;
  });
}

/** Sign the `url` of every attachment inside a comment's `images` array. */
export async function signCommentImages<T extends object>(
  rows: T[] | null | undefined
): Promise<T[]> {
  if (!rows || rows.length === 0) return rows ?? [];
  const imagesOf = (row: T): Array<{ url?: string }> | null => {
    const value = (row as { images?: unknown } | null)?.images;
    return Array.isArray(value) ? (value as Array<{ url?: string }>) : null;
  };

  const all: string[] = [];
  for (const row of rows) {
    for (const img of imagesOf(row) ?? []) {
      if (img?.url) all.push(img.url);
    }
  }
  if (all.length === 0) return rows;
  const signed = await getFileUrls(all);
  if (signed.size === 0) return rows;

  return rows.map((row) => {
    const images = imagesOf(row);
    if (!images) return row;
    return {
      ...row,
      images: images.map((img) =>
        img?.url && signed.get(img.url) ? { ...img, url: signed.get(img.url) } : img
      ),
    };
  });
}

/** Drop cached signatures for a file — call after replacing or deleting it. */
export function invalidateFileUrl(pathOrUrl: string | null | undefined, bucket = PROJECT_FILES_BUCKET): void {
  const path = toStoragePath(pathOrUrl, bucket);
  if (!path) return;
  const prefix = `${bucket}|${path}|`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Signed URL for one file, resolved for rendering. */
export function useFileUrl(
  pathOrUrl: string | null | undefined,
  options: FileUrlOptions = {}
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const t = options.transform;
  const signature = `${options.bucket ?? ""}|${t?.width ?? ""}x${t?.height ?? ""}:${t?.resize ?? ""}:${t?.quality ?? ""}|${String(options.download ?? "")}|${options.expiresIn ?? ""}`;

  useEffect(() => {
    let active = true;
    if (!pathOrUrl) {
      setUrl(null);
      return;
    }
    getFileUrl(pathOrUrl, optionsRef.current).then((signed) => {
      if (active) setUrl(signed);
    });
    return () => {
      active = false;
    };
  }, [pathOrUrl, signature]);

  return url;
}

/** Signed URLs for a list of files, keyed by the value passed in. */
export function useFileUrls(
  pathsOrUrls: Array<string | null | undefined>,
  options: Omit<FileUrlOptions, "transform"> = {}
): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const signature = pathsOrUrls.filter(Boolean).join("|");
  const bucket = options.bucket ?? PROJECT_FILES_BUCKET;

  useEffect(() => {
    let active = true;
    const list = signature ? signature.split("|") : [];
    if (list.length === 0) {
      setUrls(new Map());
      return;
    }
    getFileUrls(list, optionsRef.current).then((map) => {
      if (active) setUrls(map);
    });
    return () => {
      active = false;
    };
  }, [signature, bucket]);

  return urls;
}
