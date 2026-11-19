-- Separate server-only storage: no broad owner/licensee hub-state access.
create table public.pop_up_inspections(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 location_id uuid not null references public.locations(id),
 inspection_date date not null,
 status text not null check(status in ('draft','completed')),
 document jsonb not null,
 version integer not null default 1,
 created_by uuid not null,
 updated_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index on public.pop_up_inspections(organization_id,inspection_date desc);
alter table public.pop_up_inspections enable row level security;
revoke all on public.pop_up_inspections from anon,authenticated;
grant all on public.pop_up_inspections to service_role;
create table public.pop_up_inspection_history(
 id bigint generated always as identity primary key,
 inspection_id uuid not null references public.pop_up_inspections(id),
 organization_id uuid not null,
 actor_id uuid not null,
 before_data jsonb,
 after_data jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.pop_up_inspection_history enable row level security;
revoke all on public.pop_up_inspection_history from anon,authenticated;
grant all on public.pop_up_inspection_history to service_role;
grant usage,select on sequence public.pop_up_inspection_history_id_seq to service_role;
create function public.save_pop_up_inspection(p_org uuid,p_actor uuid,p_id uuid,p_version integer,p_location uuid,p_date date,p_status text,p_document jsonb)
returns public.pop_up_inspections language plpgsql set search_path=public as $$
declare prior public.pop_up_inspections; saved public.pop_up_inspections;
begin
 if p_actor not in ('3b54f183-564a-40fa-87f2-3c515d526623'::uuid,'50abd10b-2b24-47d4-ade2-8b0031530aac'::uuid,'71b134f9-cb66-43ed-8c45-f71d85de21df'::uuid) or not exists(select 1 from staff_access where user_id=p_actor and organization_id=p_org and is_active) then raise exception 'Private inspection access required';end if;
 if not exists(select 1 from locations where id=p_location and organization_id=p_org) then raise exception 'Location not found';end if;
 perform pg_advisory_xact_lock(hashtextextended('popup-inspection:'||p_id::text,0));
 select * into prior from pop_up_inspections where id=p_id for update;
 if prior.id is not null and prior.organization_id<>p_org then raise exception 'Inspection not found';end if;
 if coalesce(prior.version,0)<>p_version then raise exception 'Inspection changed. Open the latest saved version before continuing';end if;
 if prior.status='completed' then raise exception 'Completed inspections are preserved. Start a follow-up inspection';end if;
 insert into pop_up_inspections(id,organization_id,location_id,inspection_date,status,document,created_by,updated_by)
 values(p_id,p_org,p_location,p_date,p_status,p_document,p_actor,p_actor)
 on conflict(id) do update set location_id=excluded.location_id,inspection_date=excluded.inspection_date,status=excluded.status,document=excluded.document,updated_by=p_actor,updated_at=clock_timestamp(),version=pop_up_inspections.version+1 returning * into saved;
 insert into pop_up_inspection_history(inspection_id,organization_id,actor_id,before_data,after_data) values(saved.id,p_org,p_actor,case when prior.id is null then null else to_jsonb(prior) end,to_jsonb(saved));
 return saved;
end $$;
revoke all on function public.save_pop_up_inspection(uuid,uuid,uuid,integer,uuid,date,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_pop_up_inspection(uuid,uuid,uuid,integer,uuid,date,text,jsonb) to service_role;
