-- Richer assessments: a multi-file codebase + a GitHub-issue-style brief on the
-- ruleset. `codebase` is [{ name, content }]; `task_description` stays as the
-- short summary used on role browse cards.
alter table rulesets add column if not exists codebase jsonb not null default '[]'::jsonb;
alter table rulesets add column if not exists issue_title text;
alter table rulesets add column if not exists problem_statement text;
