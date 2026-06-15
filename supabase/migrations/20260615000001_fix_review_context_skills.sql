-- Fix get_review_context: profiles.skills is text[], not jsonb, so the original
-- coalesce(cp.skills, '[]'::jsonb) raised "COALESCE types text[] and jsonb cannot
-- be matched". jsonb_build_object converts a text[] to a JSON array directly.
create or replace function get_review_context(p_submission_id uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not (is_submission_owner(p_submission_id) or is_submission_reviewer(p_submission_id)) then
    raise exception 'Not authorized';
  end if;
  select jsonb_build_object(
    'candidate_id', s.candidate_id,
    'candidate_name', cp.full_name,
    'candidate_headline', cp.headline,
    'candidate_skills', coalesce(cp.skills, array[]::text[]),
    'role_title', r.title,
    'assessment_id', s.assessment_id,
    'status', s.status
  ) into v
  from submissions s
  join roles r on r.id = s.role_id
  left join profiles cp on cp.id = s.candidate_id
  where s.id = p_submission_id;
  return v;
end $$;
grant execute on function get_review_context(uuid) to authenticated;
