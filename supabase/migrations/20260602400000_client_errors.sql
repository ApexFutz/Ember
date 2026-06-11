-- Client-side error monitoring. The top-level React ErrorBoundary best-effort
-- inserts uncaught render errors here in production. Re-runnable.
create table if not exists client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  message text,
  stack text,
  component_stack text,
  url text,
  created_at timestamptz not null default now()
);

alter table client_errors enable row level security;

-- Anyone (incl. logged-out visitors hitting a crash) may log an error...
drop policy if exists "anyone can log a client error" on client_errors;
create policy "anyone can log a client error" on client_errors
  for insert to anon, authenticated with check (true);

-- ...but only admins can read them back.
drop policy if exists "admins read client errors" on client_errors;
create policy "admins read client errors" on client_errors
  for select to authenticated using (is_admin());
