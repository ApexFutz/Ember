-- Role status transitions: lock down candidate visibility to active roles only,
-- while keeping recruiter ownership and replay access to archived-role rulesets.
-- Re-runnable: drops policies by name / rebuilds the roles policy set deterministically.

-- ── roles: candidates read ONLY active; recruiters fully manage their own ──────
alter table roles enable row level security;

-- Rebuild the roles policy set from scratch so no legacy "read all" policy can
-- leak drafts/archived roles to candidates (SELECT policies are OR'd together).
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'roles' loop
    execute format('drop policy if exists %I on roles', p.policyname);
  end loop;
end $$;

-- Recruiters: full control over their own roles (any status).
create policy "roles recruiter all" on roles for all
  using (recruiter_id = auth.uid())
  with check (recruiter_id = auth.uid());

-- Everyone else (candidates): can only see active roles.
create policy "roles read active" on roles for select
  using (status = 'active');

-- ── rulesets: keep readable for active AND archived roles (replay) ─────────────
-- Additive read policy so an archived role's ruleset can still be replayed by a
-- candidate who took it. Does not remove existing policies.
alter table rulesets enable row level security;
drop policy if exists "rulesets read non-draft" on rulesets;
create policy "rulesets read non-draft" on rulesets for select
  using (
    exists (
      select 1 from roles r
      where r.id = rulesets.role_id
        and (r.status in ('active', 'archived') or r.recruiter_id = auth.uid())
    )
  );

-- Verification (run manually):
--   select status, count(*) from roles group by status;
--   set role authenticated; -- candidate context: should return 0 non-active rows
--   select count(*) from roles where status <> 'active';
