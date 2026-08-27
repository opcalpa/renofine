-- Firma-entiteten: en firma, inte en person med ett företagsnamn i ett textfält.
--
-- Före detta var `profiles.company_name` all firma som fanns. Följden: en
-- anställd i en tioprojektsfirma krävde tio inbjudningar, kundregistret ägdes
-- av en privatperson, och det gick inte att prissätta per kontorsplats.

create table if not exists public.companies (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  org_number            text,
  vat_number            text,
  -- Säljer VÅR firma byggtjänster mer än tillfälligt? Styr bara inköpssidan:
  -- om en leverantör får fakturera oss med omvänd betalningsskyldighet.
  sells_construction    boolean not null default true,
  default_hourly_rate   numeric(10,2),
  created_by_profile_id uuid not null references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- owner: abonnemang/fakturering. admin: kontoret. member: anställd.
  -- owner + admin är "kontorsplatser" — det priset tas betalt för.
  role       text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (company_id, profile_id)
);

create index if not exists company_members_profile_idx on public.company_members (profile_id);

-- SECURITY DEFINER, som husets övriga: en policy på companies som frågar
-- company_members, vars policy frågar companies, ger oändlig rekursion.
create or replace function public.my_company_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select company_id from public.company_members
  where profile_id = public.get_user_profile_id();
$$;

create or replace function public.user_is_company_admin(_company_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.company_members
    where company_id = _company_id
      and profile_id = public.get_user_profile_id()
      and role in ('owner','admin')
  );
$$;

alter table public.companies enable row level security;
alter table public.company_members enable row level security;

create policy companies_select on public.companies
  for select using (id in (select public.my_company_ids()));
create policy companies_insert on public.companies
  for insert with check (created_by_profile_id = public.get_user_profile_id());
create policy companies_update on public.companies
  for update using (public.user_is_company_admin(id));

create policy company_members_select on public.company_members
  for select using (company_id in (select public.my_company_ids()));
create policy company_members_write on public.company_members
  for all using (public.user_is_company_admin(company_id))
  with check (public.user_is_company_admin(company_id));

create or replace function public.tg_companies_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists companies_updated_at on public.companies;
create trigger companies_updated_at before update on public.companies
  for each row execute function public.tg_companies_updated_at();
