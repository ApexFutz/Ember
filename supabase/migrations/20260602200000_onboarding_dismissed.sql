-- Onboarding checklist: remember when a recruiter has dismissed it. Re-runnable.
alter table profiles add column if not exists onboarding_dismissed boolean not null default false;
