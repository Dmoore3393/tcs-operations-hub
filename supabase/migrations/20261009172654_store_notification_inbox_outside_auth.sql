-- Notification content must stay out of JWT app_metadata.
create table public.user_notification_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  inbox jsonb not null default '[]'::jsonb check (jsonb_typeof(inbox) = 'array'),
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.user_notification_state enable row level security;
revoke all on public.user_notification_state from public, anon, authenticated;
grant select, insert, update, delete on public.user_notification_state to service_role;

-- Preserve existing state; metadata is removed only after the new app is live.
insert into public.user_notification_state (user_id, inbox, preferences)
select id,
  case when jsonb_typeof(raw_app_meta_data->'tcs_notification_inbox') = 'array'
    then raw_app_meta_data->'tcs_notification_inbox' else '[]'::jsonb end,
  case when jsonb_typeof(raw_app_meta_data->'tcs_notification_preferences') = 'object'
    then raw_app_meta_data->'tcs_notification_preferences' else '{}'::jsonb end
from auth.users
where raw_app_meta_data ? 'tcs_notification_inbox'
   or raw_app_meta_data ? 'tcs_notification_preferences'
on conflict (user_id) do nothing;
