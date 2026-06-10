-- Per-role analytics: funnel, integrity, and status breakdown, computed
-- server-side from assessments / assessment_logs / submissions. SECURITY DEFINER
-- so it sees drop-off (never-submitted) attempts regardless of client RLS, but
-- it verifies the caller owns the role first. Re-runnable.
create or replace function role_analytics(p_role_id uuid)
  returns json
  language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  result json;
begin
  select recruiter_id into v_owner from roles where id = p_role_id;
  if v_owner is null then raise exception 'role not found'; end if;
  if v_owner <> auth.uid() then raise exception 'not authorized'; end if;

  with sub as (
    -- One row per submitted attempt, with its completion time in seconds.
    select a.id,
      extract(epoch from (a.submitted_at - a.started_at))::numeric as secs
    from assessments a
    where a.role_id = p_role_id and a.status in ('submitted', 'timed_out')
  ),
  paste as (
    -- Large-paste (> 50 chars) count per submitted attempt, straight from the log.
    select s.id,
      coalesce((
        select count(*)
        from assessment_logs al, lateral jsonb_array_elements(al.log) e
        where al.assessment_id = s.id
          and e->>'type' = 'paste'
          and char_length(coalesce(e->>'content', '')) > 50
      ), 0) as pastes
    from sub s
  ),
  started as (select count(*) c from assessments where role_id = p_role_id),
  subs as (select status from submissions where role_id = p_role_id)
  select json_build_object(
    'started', (select c from started),
    'submitted', (select count(*) from sub),
    'dropoff_rate', case when (select c from started) > 0
      then ((select c from started) - (select count(*) from sub))::numeric / (select c from started)
      else 0 end,
    'avg_completion_s', (select avg(secs) from sub where secs is not null and secs >= 0),
    'fastest_completion_s', (select min(secs) from sub where secs is not null and secs >= 0),
    'pct_with_paste', case when (select count(*) from sub) > 0
      then (select count(*) from paste where pastes > 0)::numeric / (select count(*) from sub)
      else 0 end,
    'avg_paste', case when (select count(*) from sub) > 0
      then (select coalesce(sum(pastes), 0) from paste)::numeric / (select count(*) from sub)
      else 0 end,
    'status', json_build_object(
      'pending_review', (select count(*) from subs where status = 'pending_review'),
      'reviewed',       (select count(*) from subs where status = 'reviewed'),
      'moved_forward',  (select count(*) from subs where status = 'moved_forward'),
      'passed',         (select count(*) from subs where status = 'passed')
    ),
    'total_submissions', (select count(*) from subs)
  ) into result;

  return result;
end $$;

grant execute on function role_analytics(uuid) to authenticated;
