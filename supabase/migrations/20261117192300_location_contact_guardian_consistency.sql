-- Keep the canonical guardian column consistent with corrected shared contact JSON.
create or replace function public.correct_location_child_contacts(p_child uuid,p_location uuid,p_expected timestamptz,p_values jsonb,p_verify boolean,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.children; revised jsonb; allowed jsonb;
begin
 if not(public.is_tcs_owner() or public.is_tcs_licensee()) or not public.can_access_location(p_location) or btrim(coalesce(p_reason,''))='' then raise exception 'Assigned location leadership and correction source required';end if;
 if not exists(select 1 from public.child_location_enrollments where child_id=p_child and location_id=p_location and organization_id=public.current_staff_organization_id()) then raise exception 'Child is not enrolled at this location';end if;
 select * into c from public.children where id=p_child and organization_id=public.current_staff_organization_id() for update;
 if c.id is null or c.updated_at is distinct from p_expected then return false;end if;
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into allowed from jsonb_each(p_values) where key=any(array['firstName','lastName','dateOfBirth','homeAddress','primaryGuardian','phone','secondaryGuardian','secondaryGuardianPhone','additionalGuardianContacts','medicalProvider','medicalProviderPhone']);
 revised:=c.record_data||allowed||jsonb_build_object('contactCorrectionReason',p_reason);
 if p_verify then revised:=revised||jsonb_build_object('contactsVerifiedAt',clock_timestamp(),'contactsVerifiedBy',auth.uid(),'contactsVerificationSource',p_reason);end if;
 update public.children set first_name=coalesce(allowed->>'firstName',c.first_name),last_name=coalesce(allowed->>'lastName',c.last_name),date_of_birth=case when allowed ? 'dateOfBirth' then nullif(allowed->>'dateOfBirth','')::date else c.date_of_birth end,guardian_name=coalesce(allowed->>'primaryGuardian',c.guardian_name),record_data=revised,updated_at=clock_timestamp() where id=c.id;
 return true;
end $$;
revoke all on function public.correct_location_child_contacts(uuid,uuid,timestamptz,jsonb,boolean,text) from public,anon;
grant execute on function public.correct_location_child_contacts(uuid,uuid,timestamptz,jsonb,boolean,text) to authenticated,service_role;

create or replace function tcs_files_private.validate_location_setting() returns trigger language plpgsql security definer set search_path='' as $$
declare site_name text; responsible uuid; matched integer;
begin
 select name into site_name from public.locations where id=new.location_id and organization_id=new.organization_id;
 if not found then raise exception 'Location belongs to a different organization';end if;
 if tg_op='UPDATE' and (new.organization_id,new.location_id) is distinct from (old.organization_id,old.location_id) then raise exception 'Location record cannot be moved';end if;
 if tg_table_name='location_roster_settings' then
  if lower(site_name) like '%halcom%' then
   select (array_agg(user_id))[1],count(*) into responsible,matched from public.staff_access where organization_id=new.organization_id and is_active and lower(full_name) in ('latrice moore','miss latrice','latrice');
   if matched<>1 then raise exception 'Confirm the unique Miss Latrice account for Halcom file responsibility';end if;
   new.responsible_user_id:=responsible;
  end if;
  if new.responsible_user_id is not null and not exists(select 1 from public.staff_access where user_id=new.responsible_user_id and organization_id=new.organization_id and is_active) then raise exception 'Choose an active responsible person in this organization';end if;
 end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
revoke all on function tcs_files_private.validate_location_setting() from public,anon,authenticated;
