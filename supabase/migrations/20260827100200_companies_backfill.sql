-- Backfill: en firma per proffs som redan finns.
--
-- Konservativ med flit. Bara `onboarding_user_type = 'contractor'` — det är
-- signalen som styr roll-gating i övrigt (se feedback_role_gating_signal), och
-- att gissa på company_name skulle skapa firmor åt hemägare som råkat fylla i
-- ett fält. Ingen hemägare får en firma.
--
-- clients.owner_id och projects.owner_id lämnas orörda: de är historik, och
-- koden läser company_id med fallback tills prod är verifierad.

do $$
declare _p record; _c uuid;
begin
  for _p in
    select id, coalesce(nullif(trim(company_name), ''), nullif(trim(name), ''), 'Min firma') as firm_name
    from public.profiles
    where onboarding_user_type = 'contractor'
  loop
    -- Idempotent: kör om migrationen skapar inga dubbletter.
    select c.id into _c
    from public.companies c
    join public.company_members cm on cm.company_id = c.id and cm.profile_id = _p.id and cm.role = 'owner'
    limit 1;

    if _c is null then
      insert into public.companies (name, created_by_profile_id)
      values (_p.firm_name, _p.id)
      returning id into _c;

      insert into public.company_members (company_id, profile_id, role)
      values (_c, _p.id, 'owner')
      on conflict do nothing;
    end if;

    update public.projects set company_id = _c where owner_id = _p.id and company_id is null;
    update public.clients  set company_id = _c where owner_id = _p.id and company_id is null;
  end loop;
end $$;
