-- Real time-limit enforcement: server-side ground truth + auto-submit.
-- Re-runnable.

-- ── Columns ───────────────────────────────────────────────────────────────────
alter table assessments add column if not exists started_at     timestamptz;
alter table assessments add column if not exists auto_submitted boolean not null default false;
alter table rulesets    add column if not exists time_limit_seconds int;

-- Backfill: existing in-flight rows get a started_at so enforcement has a clock.
update assessments set started_at = now() where started_at is null and status = 'in_progress';
-- Seconds mirror the recruiter-facing minutes for any ruleset missing it.
update rulesets set time_limit_seconds = time_limit_mins * 60 where time_limit_seconds is null;

-- ── Authoritative auto-submit sweep ───────────────────────────────────────────
-- Called with an id (client, on fetch — enforces just that assessment) or with
-- null (scheduler / edge function — sweeps every expired in-progress assessment).
-- Locks rows it touches so concurrent callers can't double-submit. Returns the
-- number of assessments auto-submitted.
create or replace function enforce_time_limit(p_assessment_id uuid default null)
  returns int
  language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
begin
  for r in
    select a.id, a.role_id, a.candidate_id
    from assessments a
    join rulesets rs on rs.role_id = a.role_id
    where a.status = 'in_progress'
      and a.started_at is not null
      and (p_assessment_id is null or a.id = p_assessment_id)
      and now() > a.started_at
        + make_interval(secs => coalesce(rs.time_limit_seconds, rs.time_limit_mins * 60))
    for update of a skip locked
  loop
    update assessments
      set status = 'timed_out',
          auto_submitted = true,
          submitted_at = coalesce(submitted_at, now())
      where id = r.id;

    -- Create the reviewable submission if the client never managed to.
    if not exists (select 1 from submissions where assessment_id = r.id) then
      insert into submissions (role_id, candidate_id, assessment_id, status)
        values (r.role_id, r.candidate_id, r.id, 'pending_review');
    end if;

    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function enforce_time_limit(uuid) to authenticated;

-- ── Best-effort scheduling for tab-close / network-drop cases ─────────────────
-- pg_cron may not be enabled on every project; guard so the migration still
-- applies cleanly. The enforce-time-limit edge function provides the same sweep
-- for projects without pg_cron (wire it to a scheduled trigger).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('enforce-time-limits')
      where exists (select 1 from cron.job where jobname = 'enforce-time-limits');
    perform cron.schedule('enforce-time-limits', '* * * * *', 'select enforce_time_limit()');
  else
    raise notice 'pg_cron not enabled; rely on the enforce-time-limit edge function for tab-close cases';
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
