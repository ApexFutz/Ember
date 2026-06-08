-- Public candidate profiles: shareable /c/:username pages.
alter table profiles add column if not exists username text unique;
alter table profiles add column if not exists public_profile boolean not null default true;
create unique index if not exists idx_profiles_username_lower on profiles (lower(username));

-- Curated public read: returns ONLY safe fields for a public candidate profile.
-- SECURITY DEFINER so anonymous visitors can read the curated payload without
-- exposing scores / metrics / notes / PII (no broad RLS on profiles).
create or replace function get_public_profile(p_username text) returns jsonb
  language plpgsql security definer stable set search_path = public as $$
declare p profiles; result jsonb;
begin
  select * into p from profiles
    where lower(username) = lower(p_username) and role = 'candidate';
  if p.id is null or coalesce(p.public_profile, true) = false then
    return null;
  end if;
  select jsonb_build_object(
    'full_name', p.full_name,
    'photo_url', p.photo_url,
    'availability', p.availability,
    'username', p.username,
    'assessments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role_title', r.title,
        'company', rp.company_name,
        'completed_at', s.submitted_at
      ) order by s.submitted_at desc)
      from submissions s
      join roles r on r.id = s.role_id
      join profiles rp on rp.id = r.recruiter_id
      where s.candidate_id = p.id and s.submitted_at is not null
    ), '[]'::jsonb)
  ) into result;
  return result;
end $$;

grant execute on function get_public_profile(text) to anon, authenticated;
