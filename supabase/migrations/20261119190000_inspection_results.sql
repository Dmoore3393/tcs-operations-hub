-- Released snapshots are separate from private drafts and notes. No direct browser grants.
create table public.inspection_releases (
 id uuid primary key references public.pop_up_inspections(id), organization_id uuid not null references public.organizations(id),
 location_id uuid not null references public.locations(id), location_name text not null, inspection_date date not null,
 document jsonb not null, released_by uuid not null, released_at timestamptz not null default now()
);
create table public.inspection_corrections (
 id uuid primary key default gen_random_uuid(), inspection_id uuid not null references public.inspection_releases(id),
 item_id text not null,item_name text not null,correction text not null,urgent boolean not null default false,
 assigned_user_id uuid not null,assignee_name text not null,due_date date not null,
 status text not null default 'Open' check(status in ('Open','Awaiting review','Resolved')),
 submission text not null default '',review_note text not null default '',version integer not null default 1,
 updated_at timestamptz not null default now(), unique(inspection_id,item_id)
);
create table public.inspection_result_history (
 id bigint generated always as identity primary key,inspection_id uuid not null references public.inspection_releases(id),
 actor_id uuid not null,action text not null,before_data jsonb,after_data jsonb not null,created_at timestamptz not null default now()
);
alter table public.inspection_releases enable row level security;
alter table public.inspection_corrections enable row level security;
alter table public.inspection_result_history enable row level security;
revoke all on public.inspection_releases,public.inspection_corrections,public.inspection_result_history from anon,authenticated;
grant all on public.inspection_releases,public.inspection_corrections,public.inspection_result_history to service_role;
grant usage,select on sequence public.inspection_result_history_id_seq to service_role;
create function public.release_inspection(p_org uuid,p_actor uuid,p_id uuid,p_assignee uuid,p_due date)
returns void language plpgsql set search_path=public as $$
declare visit pop_up_inspections; person staff_access; site locations; item jsonb; doc jsonb;
begin
 if p_actor not in ('3b54f183-564a-40fa-87f2-3c515d526623'::uuid,'50abd10b-2b24-47d4-ade2-8b0031530aac'::uuid,'71b134f9-cb66-43ed-8c45-f71d85de21df'::uuid) or not exists(select 1 from staff_access where user_id=p_actor and organization_id=p_org and is_active) then raise exception 'Private inspection access required';end if;
 perform pg_advisory_xact_lock(hashtextextended('release-inspection:'||p_id::text,0));
 select * into visit from pop_up_inspections where id=p_id and organization_id=p_org and status='completed';
 if visit.id is null then raise exception 'Complete and save the inspection first';end if;
 if exists(select 1 from inspection_releases where id=p_id) then return;end if;
 select * into person from staff_access where user_id=p_assignee and organization_id=p_org and is_active and lower(role) in ('location licensee','licensee','licensee/admin','licensee / admin');
 if person.user_id is null or p_due is null then raise exception 'Choose an active licensee and correction due date';end if;
 select * into site from locations where id=visit.location_id and organization_id=p_org;
 doc:=visit.document||jsonb_build_object('notes','','followUp','');
 insert into inspection_releases(id,organization_id,location_id,location_name,inspection_date,document,released_by) values(p_id,p_org,visit.location_id,site.name,visit.inspection_date,doc,p_actor);
 for item in select value from jsonb_array_elements(doc->'items') loop
  if item->>'rating' in ('partial','needs_attention') or item->>'urgent'='true' then
   insert into inspection_corrections(inspection_id,item_id,item_name,correction,urgent,assigned_user_id,assignee_name,due_date)
   values(p_id,item->>'id',item->>'label',coalesce(nullif(item->>'notes',''),item->>'label'),coalesce((item->>'urgent')::boolean,false),p_assignee,person.full_name,p_due);
  end if;
 end loop;
 insert into inspection_result_history(inspection_id,actor_id,action,after_data) values(p_id,p_actor,'Released results and assigned corrections',jsonb_build_object('document',doc,'assignee',p_assignee,'due',p_due));
end $$;
create function public.update_inspection_correction(p_org uuid,p_actor uuid,p_id uuid,p_version integer,p_action text,p_note text)
returns void language plpgsql set search_path=public as $$
declare prior inspection_corrections; saved inspection_corrections; leader boolean;
begin
 select c.* into prior from inspection_corrections c join inspection_releases r on r.id=c.inspection_id where c.id=p_id and r.organization_id=p_org for update of c;
 if prior.id is null then raise exception 'Correction not found';end if;
 if prior.version<>p_version then raise exception 'Correction changed. Refresh before continuing';end if;
 if not exists(select 1 from staff_access where user_id=p_actor and organization_id=p_org and is_active) then raise exception 'Active access required';end if;
 leader:=p_actor in ('3b54f183-564a-40fa-87f2-3c515d526623'::uuid,'50abd10b-2b24-47d4-ade2-8b0031530aac'::uuid,'71b134f9-cb66-43ed-8c45-f71d85de21df'::uuid);
 if p_action='submit' and prior.assigned_user_id=p_actor and prior.status='Open' and length(trim(p_note))>0 then
  update inspection_corrections set status='Awaiting review',submission=p_note,version=version+1,updated_at=clock_timestamp() where id=p_id returning * into saved;
 elsif p_action in ('accept','return') and leader and prior.status='Awaiting review' and (p_action='accept' or length(trim(p_note))>0) then
  update inspection_corrections set status=case when p_action='accept' then 'Resolved' else 'Open' end,review_note=p_note,version=version+1,updated_at=clock_timestamp() where id=p_id returning * into saved;
 else raise exception 'This correction action is not available';end if;
 insert into inspection_result_history(inspection_id,actor_id,action,before_data,after_data) values(prior.inspection_id,p_actor,p_action,to_jsonb(prior),to_jsonb(saved));
end $$;
revoke all on function public.release_inspection(uuid,uuid,uuid,uuid,date),public.update_inspection_correction(uuid,uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.release_inspection(uuid,uuid,uuid,uuid,date),public.update_inspection_correction(uuid,uuid,uuid,integer,text,text) to service_role;
