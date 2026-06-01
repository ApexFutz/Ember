-- Global assessment library: reusable assessments tagged by skill + difficulty,
-- bundled into roles, with a global per-candidate history for deduplication.
--
-- Naming note: the existing `assessments` table is the candidate's coding SESSION.
-- The reusable template lives here as `library_assessments`. FK columns named
-- `assessment_id` reference library_assessments(id).
--
-- Re-runnable: guarded with IF NOT EXISTS / DROP ... IF EXISTS throughout.

-- ── Difficulty enum ───────────────────────────────────────────────────────────
do $$ begin
  create type assessment_difficulty as enum ('Beginner','Intermediate','Advanced','Expert');
exception when duplicate_object then null; end $$;

-- ── Shared updated_at trigger fn ──────────────────────────────────────────────
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

-- ── library_assessments (reusable templates) ──────────────────────────────────
create table if not exists library_assessments (
  id                     uuid primary key default gen_random_uuid(),
  skill_tag              text not null,
  difficulty             assessment_difficulty not null,
  title                  text not null,
  description            text,
  estimated_time_minutes int,
  codebase               jsonb not null default '[]'::jsonb,
  problem_statement      text,
  success_criteria       text,
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_lib_skill       on library_assessments(skill_tag);
create index if not exists idx_lib_difficulty  on library_assessments(difficulty);
create index if not exists idx_lib_created_by  on library_assessments(created_by);
drop trigger if exists trg_lib_updated on library_assessments;
create trigger trg_lib_updated before update on library_assessments
  for each row execute function set_updated_at();

-- ── role_assessments (bundling) ───────────────────────────────────────────────
create table if not exists role_assessments (
  id            uuid primary key default gen_random_uuid(),
  role_id       uuid not null references roles(id) on delete cascade,
  assessment_id uuid not null references library_assessments(id) on delete cascade,
  is_required   boolean not null default true,
  order_index   int not null default 0,
  created_at    timestamptz not null default now(),
  unique (role_id, assessment_id)
);
create index if not exists idx_ra_role       on role_assessments(role_id);
create index if not exists idx_ra_assessment on role_assessments(assessment_id);

-- ── candidate_assessments (GLOBAL history; dedup on (candidate, assessment)) ──
create table if not exists candidate_assessments (
  id              uuid primary key default gen_random_uuid(),
  candidate_id    uuid not null references auth.users(id) on delete cascade,
  assessment_id   uuid not null references library_assessments(id) on delete cascade,
  status          text not null default 'in_progress'
                    check (status in ('in_progress','submitted','completed')),
  score           numeric,
  submission_data jsonb,
  first_viewed_at timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (candidate_id, assessment_id)
);
create index if not exists idx_ca_candidate  on candidate_assessments(candidate_id);
create index if not exists idx_ca_assessment on candidate_assessments(assessment_id);
drop trigger if exists trg_ca_updated on candidate_assessments;
create trigger trg_ca_updated before update on candidate_assessments
  for each row execute function set_updated_at();

-- ── role_submissions (candidate progress on a specific role) ──────────────────
create table if not exists role_submissions (
  id           uuid primary key default gen_random_uuid(),
  role_id      uuid not null references roles(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'in_progress'
                 check (status in ('in_progress','submitted','completed')),
  started_at   timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (role_id, candidate_id)
);
create index if not exists idx_rs_role      on role_submissions(role_id);
create index if not exists idx_rs_candidate on role_submissions(candidate_id);
drop trigger if exists trg_rs_updated on role_submissions;
create trigger trg_rs_updated before update on role_submissions
  for each row execute function set_updated_at();

-- ── Row-level security ────────────────────────────────────────────────────────
alter table library_assessments  enable row level security;
alter table role_assessments      enable row level security;
alter table candidate_assessments enable row level security;
alter table role_submissions      enable row level security;

-- library_assessments: shared read for authenticated users; author owns writes.
drop policy if exists "lib read"  on library_assessments;
drop policy if exists "lib write" on library_assessments;
create policy "lib read"  on library_assessments for select
  using (auth.role() = 'authenticated');
create policy "lib write" on library_assessments for all
  using (created_by = auth.uid()) with check (created_by = auth.uid());

-- role_assessments: read for authenticated; write only by the role's recruiter.
drop policy if exists "ra read"  on role_assessments;
drop policy if exists "ra write" on role_assessments;
create policy "ra read"  on role_assessments for select
  using (auth.role() = 'authenticated');
create policy "ra write" on role_assessments for all
  using (exists (select 1 from roles r where r.id = role_id and r.recruiter_id = auth.uid()))
  with check (exists (select 1 from roles r where r.id = role_id and r.recruiter_id = auth.uid()));

-- candidate_assessments: candidate owns their global history.
drop policy if exists "ca own" on candidate_assessments;
create policy "ca own" on candidate_assessments for all
  using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());

-- role_submissions: candidate owns; recruiter of the role can read.
drop policy if exists "rs own"            on role_submissions;
drop policy if exists "rs recruiter read" on role_submissions;
create policy "rs own" on role_submissions for all
  using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());
create policy "rs recruiter read" on role_submissions for select
  using (exists (select 1 from roles r where r.id = role_id and r.recruiter_id = auth.uid()));
