/**
 * One rate limiter for every edge function that a model call can be spent from.
 *
 * WHY it exists twice over:
 *
 * 1. Three functions had already hand-rolled the same 60 lines
 *    (parse-renovation-description, renaida-suggest, renaida-critic). Three
 *    copies of a security control drift, and the one that drifts is the one
 *    nobody re-reads.
 *
 * 2. Four functions that spend a model call had NO limit at all
 *    (classify-document, extract-document-text, transcribe-audio,
 *    process-document-v2). `verify_jwt = true` reads like a gate but is not
 *    one here: the publishable anon key IS a validly signed JWT, so the
 *    platform waves it through. The guest folder drop and the voice capture
 *    both travel that way on purpose — which means anyone holding the public
 *    key could loop those endpoints and spend tokens without limit.
 *
 * TRUSTING THE JWT — read this before changing a caller:
 * `sub` may only be believed when the PLATFORM verified the signature, i.e.
 * when the function is declared `verify_jwt = true`. On a `verify_jwt = false`
 * function anyone can mint an unsigned token with a fresh random `sub` per
 * request and walk straight past a per-user bucket. Those functions therefore
 * pass `trustJwt: false` and stay keyed on the client IP. Getting this
 * backwards turns the limiter into decoration, so it is a required argument
 * rather than an option with a default.
 *
 * FAIL OPEN on internal errors. A transient database hiccup must not take the
 * app down; the limiter exists to stop sustained abuse, not to be a dependency
 * of every request.
 */

export type CallerKind = 'anon' | 'authenticated';

export interface RateLimitTiers {
  /** Cap for callers we cannot name — keyed on IP. */
  anon: number;
  /** Cap for a signed-in user, keyed on their id. Only used when trustJwt. */
  authenticated: number;
  /** Rolling window. Defaults to 60 minutes. */
  windowMinutes?: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  count: number;
  limit: number;
  kind: CallerKind;
}

const DEFAULT_WINDOW_MINUTES = 60;

/**
 * How often to prune expired rows, as 1-in-N. There is no pg_cron on this
 * project, so the cheapest correct answer is to let the writers clean up after
 * themselves: the log would otherwise grow forever now that seven functions
 * write to it, and an abuse burst is exactly when it grows fastest.
 */
const PRUNE_ONE_IN = 25;
const PRUNE_KEEP_HOURS = 24;

function clientIp(req: Request): string {
  // Cloudflare → cf-connecting-ip; Supabase Edge Functions in Fly → x-real-ip;
  // generic chained proxy → first IP in x-forwarded-for. "unknown" falls back
  // to a shared bucket — coarser than we want, still better than no limit.
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return 'unknown';
}

/**
 * The `sub` of a signed-in user, or null for the anon key / anything unreadable.
 * Signature is NOT checked here — see the trustJwt note at the top of the file.
 */
function jwtSubject(req: Request): string | null {
  try {
    const auth = req.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { role?: string; sub?: string };
    if (claims.role !== 'authenticated') return null;
    return typeof claims.sub === 'string' && claims.sub ? claims.sub : null;
  } catch {
    return null;
  }
}

export function identifyCaller(req: Request, trustJwt: boolean): { key: string; kind: CallerKind } {
  const sub = trustJwt ? jwtSubject(req) : null;
  if (sub) return { key: `user:${sub}`, kind: 'authenticated' };
  return { key: `ip:${clientIp(req)}`, kind: 'anon' };
}

function restHeaders() {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

function restUrl(path: string): string {
  return `${Deno.env.get('SUPABASE_URL')!}/rest/v1/${path}`;
}

function prune(scope: string): void {
  const cutoff = new Date(Date.now() - PRUNE_KEEP_HOURS * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({ scope: `eq.${scope}`, created_at: `lt.${cutoff}` });
  fetch(`${restUrl('edge_rate_limits')}?${params}`, {
    method: 'DELETE',
    headers: restHeaders(),
  }).catch((e) => console.error('rate-limit prune failed:', e));
}

/**
 * Counts recent calls for this caller and records the current one.
 *
 * `trustJwt` MUST mirror the function's `verify_jwt` setting in config.toml.
 * See the note at the top of this file for what goes wrong otherwise.
 */
export async function checkRateLimit(
  req: Request,
  scope: string,
  tiers: RateLimitTiers,
  trustJwt: boolean
): Promise<RateLimitVerdict> {
  const { key, kind } = identifyCaller(req, trustJwt);
  const limit = kind === 'authenticated' ? tiers.authenticated : tiers.anon;

  try {
    const windowMinutes = tiers.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    const params = new URLSearchParams({
      select: 'id',
      scope: `eq.${scope}`,
      fingerprint: `eq.${key}`,
      created_at: `gte.${since}`,
    });
    const countRes = await fetch(`${restUrl('edge_rate_limits')}?${params}`, {
      headers: { ...restHeaders(), Prefer: 'count=exact' },
    });
    if (!countRes.ok) return { allowed: true, count: 0, limit, kind };

    const range = countRes.headers.get('content-range') || '';
    const count = parseInt(range.split('/')[1] || '0', 10) || 0;
    if (count >= limit) return { allowed: false, count, limit, kind };

    // Fire-and-forget: the request should not wait on its own bookkeeping.
    fetch(restUrl('edge_rate_limits'), {
      method: 'POST',
      headers: restHeaders(),
      body: JSON.stringify({ fingerprint: key, scope }),
    }).catch((e) => console.error('rate-limit insert failed:', e));

    if (Math.random() < 1 / PRUNE_ONE_IN) prune(scope);

    return { allowed: true, count: count + 1, limit, kind };
  } catch (err) {
    console.error('checkRateLimit failed (failing open):', err);
    return { allowed: true, count: 0, limit, kind };
  }
}

/**
 * The 429 body. `extra` lets a caller keep its own success shape so the client
 * can read a rate-limited response with the same parser it always uses — the
 * existing three functions return `{ error, flags: [] }` and similar, and the
 * clients depend on that field being present.
 */
export function rateLimitedBody(extra: Record<string, unknown> = {}) {
  return {
    error: 'Rate limit exceeded',
    message: 'Too many requests. Please wait a while and try again.',
    ...extra,
  };
}
