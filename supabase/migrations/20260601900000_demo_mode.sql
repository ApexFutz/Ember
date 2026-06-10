-- Demo mode: guest recruiter session backing data, write-blocking, analytics,
-- and a 24h reset. The demo recruiter/candidate auth users are created by the
-- seed script, which stores their ids in app_settings (demo_user_id /
-- demo_candidate_id). Re-runnable.

-- ── Analytics ─────────────────────────────────────────────────────────────────
create table if not exists demo_sessions (
  id             uuid primary key default gen_random_uuid(),
  started_at     timestamptz not null default now(),
  referrer       text,
  clicked_signup boolean not null default false
);
alter table demo_sessions enable row level security; -- service-role only

-- ── Write-blocking ────────────────────────────────────────────────────────────
-- Server-side guarantee that a logged-in demo session can never mutate data,
-- regardless of client behaviour. Raises only for the demo user; everyone else
-- is unaffected. reset_demo_data() runs SECURITY DEFINER with auth.uid() = null,
-- so it is never blocked.
create or replace function block_demo_writes() returns trigger
  language plpgsql security definer set search_path = public as $$
declare demo_uid uuid;
begin
  select value::uuid into demo_uid from app_settings where key = 'demo_user_id';
  if demo_uid is not null and auth.uid() = demo_uid then
    raise exception 'This is a demo — sign up to use this feature.' using errcode = '42501';
  end if;
  return coalesce(NEW, OLD);
end $$;

do $$
declare t text;
begin
  foreach t in array array['submissions','messages','threads','roles','rulesets','assessments','profiles']
  loop
    execute format('drop trigger if exists trg_block_demo on %I', t);
    execute format(
      'create trigger trg_block_demo before insert or update or delete on %I
         for each row execute function block_demo_writes()', t);
  end loop;
end $$;

-- ── Reset to seed state ───────────────────────────────────────────────────────
-- Single source of truth for the demo's data. Called once by the seed script and
-- nightly by cron. Rebuilds the role, ruleset, a submitted assessment with ~500
-- keystroke entries (1 paste, 2 focus losses), the submission, and a message
-- thread. No-op until both demo ids are present in app_settings.
create or replace function reset_demo_data() returns void
  language plpgsql security definer set search_path = public as $$
declare
  demo_uid uuid;
  cand_uid uuid;
  v_role uuid;
  v_assessment uuid;
  v_thread uuid;
  v_log jsonb;
  v_start timestamptz := now() - interval '40 minutes';
  v_base bigint;
begin
  select value::uuid into demo_uid from app_settings where key = 'demo_user_id';
  select value::uuid into cand_uid from app_settings where key = 'demo_candidate_id';
  if demo_uid is null or cand_uid is null then return; end if;
  v_base := (extract(epoch from v_start) * 1000)::bigint;

  update profiles set role = 'recruiter', full_name = 'Demo Recruiter',
    company_name = 'Northwind (Demo)' where id = demo_uid;
  update profiles set role = 'candidate', full_name = 'Jordan Rivera',
    headline = 'Frontend Engineer · React/TS',
    skills = array['React','TypeScript','CSS','Jest'] where id = cand_uid;

  -- Tear down any existing demo data (explicit order; FKs vary).
  delete from messages where thread_id in (select id from threads where recruiter_id = demo_uid);
  delete from threads where recruiter_id = demo_uid;
  delete from status_events where submission_id in
    (select id from submissions where role_id in (select id from roles where recruiter_id = demo_uid));
  delete from submissions where role_id in (select id from roles where recruiter_id = demo_uid);
  delete from assessment_logs where assessment_id in
    (select id from assessments where role_id in (select id from roles where recruiter_id = demo_uid));
  delete from assessments where role_id in (select id from roles where recruiter_id = demo_uid);
  delete from rulesets where role_id in (select id from roles where recruiter_id = demo_uid);
  delete from roles where recruiter_id = demo_uid;

  insert into roles (recruiter_id, title, department, location, description, status)
    values (demo_uid, 'Frontend Engineer — Build a filterable product list',
      'Engineering', 'remote',
      'Build a filterable, searchable product list in React.', 'active')
    returning id into v_role;

  insert into rulesets (role_id, stack_tags, task_type, task_description, time_limit_mins,
      time_limit_seconds, ai_allowed, starter_template, runtime, issue_title, problem_statement,
      tests, codebase)
    values (v_role, array['React','TypeScript'], 'build_a_feature',
      'Build a filterable product list with search + category filter.', 60, 3600, false,
      'blank', 'node', 'Filterable product list',
      'Render products with a search box and category dropdown that filter in real time. Export filterProducts(products, query, category).',
      '[]'::jsonb,
      jsonb_build_array(jsonb_build_object('name','solution.js',
        'content','export function filterProducts(products, query, category) {\n  // TODO\n}\n')));

  insert into assessments (role_id, candidate_id, status, files, time_limit_mins,
      started_at, submitted_at, auto_submitted)
    values (v_role, cand_uid, 'submitted',
      jsonb_build_array(jsonb_build_object('name','solution.js',
        'content','export function filterProducts(products, query, category){ return products.filter(p => (!category || p.category===category) && p.name.toLowerCase().includes(query.toLowerCase())); }')),
      60, v_start, v_start + interval '32 minutes', false)
    returning id into v_assessment;

  -- ~500 entries: 497 keystrokes + 1 paste + 2 focus losses, ordered by timestamp.
  with base as (
    select gs as i,
      substr('export function filterProducts(products, query, category){ return products.filter(p => (!category || p.category===category) && p.name.toLowerCase().includes(query.toLowerCase())); } ',
        ((gs - 1) % 150) + 1, 1) as ch
    from generate_series(1, 497) gs
  ),
  inserts as (
    select jsonb_build_object('timestamp', v_base + i * 3000, 'file', 'solution.js',
      'type', 'insert', 'content', ch, 'position', i - 1) as e
    from base
  ),
  extra as (
    select e from (values
      (jsonb_build_object('timestamp', v_base + 600000, 'file', 'solution.js', 'type', 'paste',
        'content', 'const products = await fetch("/api/products").then(r => r.json()); // pasted boilerplate longer than fifty characters', 'position', 60)),
      (jsonb_build_object('timestamp', v_base + 300000, 'file', 'solution.js', 'type', 'focus_loss',
        'content', 'tab_hidden', 'position', 0)),
      (jsonb_build_object('timestamp', v_base + 900000, 'file', 'solution.js', 'type', 'focus_loss',
        'content', 'window_blur', 'position', 0))
    ) v(e)
  )
  select jsonb_agg(e order by (e->>'timestamp')::bigint) into v_log
  from (select e from inserts union all select e from extra) u;

  insert into assessment_logs (assessment_id, log, finalized) values (v_assessment, v_log, true);

  insert into submissions (role_id, candidate_id, assessment_id, status)
    values (v_role, cand_uid, v_assessment, 'pending_review');

  insert into threads (recruiter_id, candidate_id, role_id)
    values (demo_uid, cand_uid, v_role) returning id into v_thread;
  insert into messages (thread_id, sender_id, content, read, created_at) values
    (v_thread, demo_uid, 'Hi Jordan — impressive submission! The filter logic is really clean.', true, v_start + interval '34 minutes'),
    (v_thread, cand_uid, 'Thanks! Happy to walk through how I handled the category filter.', true, v_start + interval '36 minutes'),
    (v_thread, demo_uid, 'Perfect — are you free for a quick call this week?', false, v_start + interval '38 minutes');
end $$;

-- Nightly reset at 03:00 UTC (best-effort; needs pg_cron, enabled earlier).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('reset-demo-data')
      where exists (select 1 from cron.job where jobname = 'reset-demo-data');
    perform cron.schedule('reset-demo-data', '0 3 * * *', 'select reset_demo_data()');
  end if;
exception when others then
  raise notice 'demo reset scheduling skipped: %', sqlerrm;
end $$;
