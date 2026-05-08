-- Generic per-IP rate-limit log used by edge functions that allow anonymous calls
-- (e.g. parse-renovation-description for guest-mode users). Edge functions write
-- one row per call (using service role to bypass RLS) and count recent rows for
-- the same fingerprint+scope to enforce caps.

create table if not exists public.edge_rate_limits (
  id bigserial primary key,
  fingerprint text not null,
  scope text not null,
  created_at timestamptz not null default now()
);

-- Lookup: count(*) where scope = ? and fingerprint = ? and created_at > ?
create index if not exists edge_rate_limits_lookup_idx
  on public.edge_rate_limits (scope, fingerprint, created_at desc);

-- RLS on, no policies — only service role can read/write.
-- Anon and authenticated users have no access at all.
alter table public.edge_rate_limits enable row level security;

comment on table public.edge_rate_limits is
  'Per-fingerprint (typically client IP) rate-limit log for edge functions that '
  'allow anonymous calls. Service-role only.';
