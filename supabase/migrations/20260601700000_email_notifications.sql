-- Email notifications: per-user opt-out flag + a small log used for the
-- new-message debounce and basic auditing. Re-runnable.

alter table profiles add column if not exists email_notifications boolean not null default true;

create table if not exists notification_log (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null,
  event        text not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_notiflog_recipient
  on notification_log (recipient_id, event, created_at desc);

-- RPC-/service-role-only: enable RLS with no client policies.
alter table notification_log enable row level security;
