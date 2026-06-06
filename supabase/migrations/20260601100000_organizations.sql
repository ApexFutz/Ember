-- Enterprise organizations: a recruiter creates an org (becomes admin), then
-- invites other recruiters who must accept (two-way handshake). Management only.

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  org_id       uuid not null references organizations(id) on delete cascade,
  recruiter_id uuid not null references auth.users(id) on delete cascade,
  member_role  text not null default 'member' check (member_role in ('admin','member')),
  created_at   timestamptz not null default now(),
  primary key (org_id, recruiter_id)
);
create index if not exists idx_org_members_recruiter on organization_members(recruiter_id);

create table if not exists organization_invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  email        text not null,
  member_role  text not null default 'member' check (member_role in ('admin','member')),
  status       text not null default 'pending' check (status in ('pending','accepted','declined','revoked')),
  invited_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (org_id, email)
);
create index if not exists idx_org_invites_email on organization_invitations(lower(email));

-- ── Membership helpers (SECURITY DEFINER to avoid RLS recursion) ──────────────
create or replace function is_org_member(p_org uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists(select 1 from organization_members m
    where m.org_id = p_org and m.recruiter_id = auth.uid())
$$;
create or replace function is_org_admin(p_org uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists(select 1 from organization_members m
    where m.org_id = p_org and m.recruiter_id = auth.uid() and m.member_role = 'admin')
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table organizations            enable row level security;
alter table organization_members     enable row level security;
alter table organization_invitations enable row level security;

drop policy if exists "org select"  on organizations;
drop policy if exists "org write"   on organizations;
create policy "org select" on organizations for select using (is_org_member(id));
create policy "org write"  on organizations for all using (is_org_admin(id)) with check (is_org_admin(id));

drop policy if exists "mem select" on organization_members;
drop policy if exists "mem write"  on organization_members;
create policy "mem select" on organization_members for select using (is_org_member(org_id));
create policy "mem write"  on organization_members for all using (is_org_admin(org_id)) with check (is_org_admin(org_id));

drop policy if exists "inv select" on organization_invitations;
drop policy if exists "inv write"  on organization_invitations;
create policy "inv select" on organization_invitations for select
  using (is_org_admin(org_id) or lower(email) = lower(auth.email()));
create policy "inv write" on organization_invitations for all
  using (is_org_admin(org_id)) with check (is_org_admin(org_id));

-- ── Privileged RPCs: bootstrap + the accept/decline handshake ─────────────────
create or replace function create_organization(p_name text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  insert into organizations (name, owner_id) values (p_name, auth.uid()) returning id into new_id;
  insert into organization_members (org_id, recruiter_id, member_role) values (new_id, auth.uid(), 'admin');
  return new_id;
end $$;

create or replace function accept_invitation(p_invite uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare inv organization_invitations;
begin
  select * into inv from organization_invitations where id = p_invite;
  if inv.id is null then raise exception 'Invitation not found'; end if;
  if inv.status <> 'pending' then raise exception 'Invitation is no longer pending'; end if;
  if lower(inv.email) <> lower(auth.email()) then raise exception 'This invitation is for a different email'; end if;
  insert into organization_members (org_id, recruiter_id, member_role)
    values (inv.org_id, auth.uid(), inv.member_role)
    on conflict (org_id, recruiter_id) do nothing;
  update organization_invitations set status = 'accepted', responded_at = now() where id = p_invite;
end $$;

create or replace function decline_invitation(p_invite uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare inv organization_invitations;
begin
  select * into inv from organization_invitations where id = p_invite;
  if inv.id is null then raise exception 'Invitation not found'; end if;
  if lower(inv.email) <> lower(auth.email()) then raise exception 'This invitation is for a different email'; end if;
  update organization_invitations set status = 'declined', responded_at = now() where id = p_invite;
end $$;
