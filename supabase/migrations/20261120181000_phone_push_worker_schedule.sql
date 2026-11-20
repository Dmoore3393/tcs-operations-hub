-- Worker credential is provisioned separately in Vault and the hosting environment.
create or replace function tcs_files_private.wake_phone_push_worker() returns void language plpgsql security definer set search_path='' as $$
declare secret text;
begin
 if not exists(select 1 from public.notification_push_queue where status in ('pending','no_device','sending') and next_attempt_at<=now() and (lease_until is null or lease_until<now())) then return;end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='tcs_phone_push_worker_secret';
 if secret is null then return;end if;
 perform net.http_post(url:='https://thetcshub.com/api/cron/phone-push',headers:=jsonb_build_object('Authorization','Bearer '||secret,'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=55000);
end $$;
revoke all on function tcs_files_private.wake_phone_push_worker() from public,anon,authenticated;
do $$ begin
 if not exists(select 1 from cron.job where jobname='tcs-phone-push-worker') then
  perform cron.schedule('tcs-phone-push-worker','* * * * *','select tcs_files_private.wake_phone_push_worker();');
 end if;
end $$;
