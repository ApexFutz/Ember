-- Founding recruiter program: invite-code gate, founding flag, welcome flag, admin.

alter table profiles add column if not exists founding_recruiter boolean not null default false;
alter table profiles add column if not exists has_seen_welcome   boolean not null default false;

create table if not exists invite_codes (
  code       text primary key,
  used_by    uuid references profiles(id),
  used_at    timestamptz,
  max_uses   int not null default 1,
  uses       int not null default 0,
  created_at timestamptz not null default now()
);
alter table invite_codes enable row level security; -- no client policies; RPC-only access

create table if not exists app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table app_admins enable row level security;
drop policy if exists "admins read self" on app_admins;
create policy "admins read self" on app_admins for select using (user_id = auth.uid());

-- Seed 10 single-use founding codes.
insert into invite_codes (code) values
  ('EMBER-FOUNDING-7QK2'), ('EMBER-FOUNDING-M4XP'), ('EMBER-FOUNDING-9TRA'),
  ('EMBER-FOUNDING-VZ3C'), ('EMBER-FOUNDING-LH8N'), ('EMBER-FOUNDING-2WED'),
  ('EMBER-FOUNDING-PB5K'), ('EMBER-FOUNDING-Y6FQ'), ('EMBER-FOUNDING-RJ4M'),
  ('EMBER-FOUNDING-D8XS')
on conflict (code) do nothing;

-- ── Functions ─────────────────────────────────────────────────────────────────
-- Pure check (anon-callable) for pre-signup validation; no mutation.
create or replace function check_invite_code(p_code text) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from invite_codes
    where upper(code) = upper(trim(p_code)) and uses < max_uses
  )
$$;

-- Consume a code + flag the caller as a founding recruiter.
create or replace function redeem_invite_code(p_code text) returns void
  language plpgsql security definer set search_path = public as $$
declare c invite_codes;
begin
  select * into c from invite_codes where upper(code) = upper(trim(p_code)) for update;
  if c.code is null or c.uses >= c.max_uses then
    raise exception 'invalid or used code';
  end if;
  update invite_codes set
    uses = uses + 1,
    used_by = coalesce(used_by, auth.uid()),
    used_at = coalesce(used_at, now())
  where code = c.code;
  update profiles set founding_recruiter = true where id = auth.uid();
end $$;

create or replace function is_admin() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists(select 1 from app_admins where user_id = auth.uid())
$$;

create or replace function admin_list_founders() returns table(id uuid, full_name text, created_at timestamptz)
  language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return query
    select p.id, p.full_name, p.created_at from profiles p
    where p.founding_recruiter = true order by p.created_at desc;
end $$;

create or replace function admin_list_invite_codes()
  returns table(code text, max_uses int, uses int, used_by uuid, used_at timestamptz)
  language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return query
    select i.code, i.max_uses, i.uses, i.used_by, i.used_at from invite_codes i
    order by i.used_at desc nulls last, i.code;
end $$;

grant execute on function check_invite_code(text) to anon, authenticated;
grant execute on function redeem_invite_code(text) to authenticated;
grant execute on function is_admin() to authenticated;
grant execute on function admin_list_founders() to authenticated;
grant execute on function admin_list_invite_codes() to authenticated;
