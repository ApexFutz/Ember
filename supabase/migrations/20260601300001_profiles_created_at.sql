-- Ensure profiles.created_at exists (used by admin_list_founders ordering).
alter table profiles add column if not exists created_at timestamptz not null default now();
