-- Stripe billing foundation for recruiter subscriptions and per-hire events.
-- Re-runnable: guarded with IF NOT EXISTS / DROP ... IF EXISTS throughout.

alter table profiles add column if not exists stripe_customer_id text;
alter table profiles add column if not exists stripe_subscription_id text;
alter table profiles add column if not exists subscription_status text not null default 'inactive';
alter table profiles add column if not exists subscription_tier text not null default 'free';
alter table profiles add column if not exists subscription_current_period_end timestamptz;

do $$ begin
  alter table profiles add constraint profiles_subscription_status_check
    check (subscription_status in (
      'inactive',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'unpaid'
    ));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table profiles add constraint profiles_subscription_tier_check
    check (subscription_tier in ('free', 'founding', 'starter', 'growth', 'enterprise'));
exception when duplicate_object then null; end $$;

create unique index if not exists idx_profiles_stripe_customer_id
  on profiles (stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists idx_profiles_stripe_subscription_id
  on profiles (stripe_subscription_id) where stripe_subscription_id is not null;
create index if not exists idx_profiles_subscription_status
  on profiles (subscription_status);

create table if not exists stripe_webhook_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  payload jsonb not null default '{}'::jsonb
);
alter table stripe_webhook_events enable row level security;

create table if not exists hire_events (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references profiles(id) on delete cascade,
  submission_id uuid not null references submissions(id) on delete cascade,
  stripe_payment_intent_id text not null unique,
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'usd',
  created_at timestamptz not null default now(),
  unique (recruiter_id, submission_id, stripe_payment_intent_id)
);
create index if not exists idx_hire_events_recruiter
  on hire_events (recruiter_id, created_at desc);
create index if not exists idx_hire_events_submission
  on hire_events (submission_id);

alter table hire_events enable row level security;
drop policy if exists "hire events recruiter read" on hire_events;
create policy "hire events recruiter read" on hire_events for select using (
  recruiter_id = auth.uid()
  and exists (
    select 1 from submissions s
    join roles r on r.id = s.role_id
    where s.id = hire_events.submission_id and r.recruiter_id = auth.uid()
  )
);
