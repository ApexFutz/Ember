-- Status history: log every submission status change (incl. the initial create)
-- to status_events, for the recruiter-facing timeline. Re-runnable.

create table if not exists status_events (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid references submissions(id) on delete cascade,
  from_status   text,
  to_status     text not null,
  changed_by    uuid references profiles(id),
  changed_at    timestamptz not null default now()
);
create index if not exists idx_status_events_submission
  on status_events (submission_id, changed_at);

-- RLS: a recruiter may read events only for submissions on roles they own.
-- No candidate policy → candidates never see status history. Inserts happen via
-- the SECURITY DEFINER trigger below, so no client insert policy is needed.
alter table status_events enable row level security;
drop policy if exists "se recruiter read" on status_events;
create policy "se recruiter read" on status_events for select using (
  exists (
    select 1 from submissions s
    join roles r on r.id = s.role_id
    where s.id = status_events.submission_id and r.recruiter_id = auth.uid()
  )
);

-- Auto-log: initial status on INSERT, and every status change on UPDATE.
create or replace function log_status_event() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    insert into status_events (submission_id, from_status, to_status, changed_by)
      values (NEW.id, null, NEW.status, auth.uid());
  elsif TG_OP = 'UPDATE' and NEW.status is distinct from OLD.status then
    insert into status_events (submission_id, from_status, to_status, changed_by)
      values (NEW.id, OLD.status, NEW.status, auth.uid());
  end if;
  return NEW;
end $$;

drop trigger if exists trg_log_status_event_ins on submissions;
create trigger trg_log_status_event_ins after insert on submissions
  for each row execute function log_status_event();

drop trigger if exists trg_log_status_event_upd on submissions;
create trigger trg_log_status_event_upd after update on submissions
  for each row execute function log_status_event();

-- Backfill an initial event for pre-existing submissions that have no history.
insert into status_events (submission_id, from_status, to_status, changed_by, changed_at)
  select s.id, null, s.status, null, coalesce(s.submitted_at, now())
  from submissions s
  where not exists (select 1 from status_events se where se.submission_id = s.id);
