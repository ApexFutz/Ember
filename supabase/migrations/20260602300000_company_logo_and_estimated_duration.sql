-- Surface candidate availability + company info on cards. Re-runnable.
-- Recruiter company logo (optional — falls back to an initials avatar on role cards).
alter table profiles add column if not exists company_logo_url text;

-- Estimated assessment duration shown on candidate role cards (optional).
alter table rulesets add column if not exists estimated_duration_minutes int;
