-- Supabase projects may have broad default service-role table grants.
-- The application archives onboarding histories instead of deleting them.
revoke all on public.staff_onboarding_plans from service_role;
grant select,insert,update on public.staff_onboarding_plans to service_role;
