-- Firmamedlemskap materialiseras som project_shares.
--
-- Varför inte bara lägga en firmagren i user_has_project_access(): 26 policyer
-- i 20 tabeller INLINAR sin project_shares-check och ärver därför ingenting
-- från funktionen. Att skriva om 26 policyer är en stor sprängradie; att låta
-- datan uppfylla den invariant som redan gäller är en liten. Samma val som
-- task_costs-flytten: en strukturell gräns slår disciplin på 26 ställen.
--
-- Raderna märks `source='company'` så att de kan underhållas utan att någonsin
-- röra en delning en människa skapat för hand.

alter table public.project_shares
  add column if not exists source text not null default 'manual'
  check (source in ('manual','company'));

alter table public.projects add column if not exists company_id uuid references public.companies(id);
alter table public.clients  add column if not exists company_id uuid references public.companies(id);

-- Köparvillkoret i omvänd byggmoms handlar om KUNDEN, inte om oss.
-- Default false: en hemägare säljer aldrig byggtjänster, och ett fel åt det
-- hållet är en faktura utan moms som Skatteverket underkänner.
alter table public.clients add column if not exists sells_construction boolean not null default false;
alter table public.clients add column if not exists vat_number text;

create index if not exists projects_company_idx on public.projects (company_id);
create index if not exists clients_company_idx  on public.clients (company_id);
create index if not exists project_shares_source_idx on public.project_shares (project_id, source);

/**
 * Gör om firmans medlemslista till delningar på ETT projekt.
 * Idempotent: kan köras hur många gånger som helst.
 */
create or replace function public.sync_company_shares(_project_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  _company_id uuid;
  _owner_id   uuid;
begin
  select company_id, owner_id into _company_id, _owner_id
  from public.projects where id = _project_id;

  -- Rader vars medlem har lämnat firman (eller projektet bytt firma) städas.
  delete from public.project_shares ps
  where ps.project_id = _project_id
    and ps.source = 'company'
    and (
      _company_id is null
      or not exists (
        select 1 from public.company_members cm
        where cm.company_id = _company_id
          and cm.profile_id = ps.shared_with_user_id
      )
    );

  if _company_id is null then return; end if;

  insert into public.project_shares (
    project_id, shared_with_user_id, role, role_type, source,
    timeline_access, tasks_access, tasks_scope, space_planner_access,
    purchases_access, purchases_scope, overview_access, files_access,
    teams_access, budget_access, time_tracking_access, can_create_purchase_requests
  )
  select
    _project_id,
    cm.profile_id,
    case when cm.role in ('owner','admin') then 'admin' else 'editor' end,
    -- co_owner gör user_owns_project() sann: rätt för den som driver firman,
    -- fel för en anställd. Anställda får 'colleague' — en ny sort som inget
    -- kundvy-villkor känner igen, alltså ingen oavsiktlig kundbehörighet.
    case when cm.role in ('owner','admin') then 'co_owner' else 'colleague' end,
    'company',
    'edit', 'edit', 'all', 'edit',
    'edit', 'all', 'edit', 'edit',
    case when cm.role in ('owner','admin') then 'edit' else 'none' end,
    case when cm.role in ('owner','admin') then 'edit' else 'none' end,
    'edit',
    true
  from public.company_members cm
  where cm.company_id = _company_id
    -- Ägaren behöver ingen delning till sig själv.
    and cm.profile_id is distinct from _owner_id
    and not exists (
      select 1 from public.project_shares ps
      where ps.project_id = _project_id
        and ps.shared_with_user_id = cm.profile_id
    );
end; $$;

create or replace function public.tg_company_members_fanout()
returns trigger language plpgsql security definer set search_path = public
as $$
declare _p uuid;
begin
  for _p in
    select id from public.projects
    where company_id = coalesce(new.company_id, old.company_id)
  loop
    perform public.sync_company_shares(_p);
  end loop;
  return coalesce(new, old);
end; $$;

drop trigger if exists company_members_fanout on public.company_members;
create trigger company_members_fanout
  after insert or update or delete on public.company_members
  for each row execute function public.tg_company_members_fanout();

create or replace function public.tg_projects_company_fanout()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform public.sync_company_shares(new.id);
  return new;
end; $$;

drop trigger if exists projects_company_fanout on public.projects;
create trigger projects_company_fanout
  after insert or update of company_id on public.projects
  for each row execute function public.tg_projects_company_fanout();

/**
 * Nya projekt föds i firman.
 *
 * Utan detta skulle backfillen täcka det som fanns, och varje projekt skapat
 * dagen efter vara osynligt för kollegorna — den sortens lucka som ser ut som
 * en behörighetsbugg långt senare.
 */
create or replace function public.tg_projects_default_company()
returns trigger language plpgsql security definer set search_path = public
as $$
declare _c uuid;
begin
  if new.company_id is null and new.owner_id is not null then
    select cm.company_id into _c
    from public.company_members cm
    where cm.profile_id = new.owner_id
    limit 2;   -- hör ägaren till flera firmor är valet inte vårt att göra
    if (select count(*) from public.company_members where profile_id = new.owner_id) = 1 then
      new.company_id := _c;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists projects_default_company on public.projects;
create trigger projects_default_company
  before insert on public.projects
  for each row execute function public.tg_projects_default_company();
