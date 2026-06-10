-- Billing intent capture + pricing-page analytics (no Stripe yet). Re-runnable.

create table if not exists billing_interest (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles(id) on delete cascade,
  plan_tier  text not null,
  created_at timestamptz not null default now()
);
alter table billing_interest enable row level security;
drop policy if exists "bi insert own" on billing_interest;
create policy "bi insert own" on billing_interest for insert
  with check (user_id = auth.uid());
drop policy if exists "bi read own" on billing_interest;
create policy "bi read own" on billing_interest for select
  using (user_id = auth.uid());

create table if not exists page_views (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles(id) on delete cascade,
  page       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_page_views_page on page_views (page, created_at);
alter table page_views enable row level security;
drop policy if exists "pv insert own" on page_views;
create policy "pv insert own" on page_views for insert
  with check (user_id = auth.uid());
