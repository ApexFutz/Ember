-- Collaborative panel review for submissions.
-- Lets the role owner invite up to 5 recruiters to independently review a
-- submission (verdict + private note + timestamped replay annotations) and see
-- an aggregate decision. RLS keeps reviewers fully isolated from each other;
-- only the role owner can read the aggregate. Re-runnable.

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists reviews (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  reviewer_id   uuid not null references profiles(id) on delete cascade,
  verdict       text check (verdict in ('strong_yes', 'yes', 'no', 'strong_no')),
  private_note  text,
  status        text not null default 'pending' check (status in ('pending', 'submitted')),
  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (submission_id, reviewer_id)
);
create index if not exists idx_reviews_submission on reviews(submission_id);
create index if not exists idx_reviews_reviewer   on reviews(reviewer_id);

create table if not exists replay_annotations (
  id                  uuid primary key default gen_random_uuid(),
  submission_id       uuid not null references submissions(id) on delete cascade,
  reviewer_id         uuid not null references profiles(id) on delete cascade,
  replay_timestamp_ms int not null,
  body                text not null,
  created_at          timestamptz not null default now()
);
create index if not exists idx_annotations_submission on replay_annotations(submission_id);

-- ── Helpers (SECURITY DEFINER breaks RLS recursion between the tables) ───────
create or replace function is_submission_owner(p_sub uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from submissions s join roles r on r.id = s.role_id
    where s.id = p_sub and r.recruiter_id = auth.uid()
  );
$$;

create or replace function is_submission_reviewer(p_sub uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from reviews rv where rv.submission_id = p_sub and rv.reviewer_id = auth.uid()
  );
$$;

-- ── RLS: reviews ────────────────────────────────────────────────────────────
alter table reviews enable row level security;

drop policy if exists "review select"  on reviews;
drop policy if exists "review insert"  on reviews;
drop policy if exists "review update"  on reviews;
drop policy if exists "review delete"  on reviews;
-- Reviewer reads only their own row; owner reads all rows for their submission.
create policy "review select" on reviews for select
  using (reviewer_id = auth.uid() or is_submission_owner(submission_id));
-- Only the role owner creates review rows (invites).
create policy "review insert" on reviews for insert
  with check (is_submission_owner(submission_id));
-- Reviewer fills in / submits their own row.
create policy "review update" on reviews for update
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());
-- Owner can revoke an invite.
create policy "review delete" on reviews for delete
  using (is_submission_owner(submission_id));

-- ── RLS: replay_annotations ─────────────────────────────────────────────────
alter table replay_annotations enable row level security;

drop policy if exists "annotation select" on replay_annotations;
drop policy if exists "annotation insert" on replay_annotations;
drop policy if exists "annotation delete" on replay_annotations;
-- Reviewer sees only their own annotations; owner sees all (for the filter view).
create policy "annotation select" on replay_annotations for select
  using (reviewer_id = auth.uid() or is_submission_owner(submission_id));
create policy "annotation insert" on replay_annotations for insert
  with check (
    reviewer_id = auth.uid()
    and (is_submission_reviewer(submission_id) or is_submission_owner(submission_id))
  );
create policy "annotation delete" on replay_annotations for delete
  using (reviewer_id = auth.uid());

-- ── Reviewer read-access to the replay data (additive permissive SELECT) ─────
-- Invited reviewers are recruiters who don't own the role, so existing owner-only
-- RLS blocks the replay. These OR-combine with existing policies to grant reads.
drop policy if exists "review reviewer read submission" on submissions;
create policy "review reviewer read submission" on submissions for select
  using (is_submission_reviewer(id));

drop policy if exists "review reviewer read assessment" on assessments;
create policy "review reviewer read assessment" on assessments for select
  using (exists (
    select 1 from submissions s
    where s.assessment_id = assessments.id and is_submission_reviewer(s.id)
  ));

drop policy if exists "review reviewer read logs" on assessment_logs;
create policy "review reviewer read logs" on assessment_logs for select
  using (exists (
    select 1 from submissions s
    where s.assessment_id = assessment_logs.assessment_id and is_submission_reviewer(s.id)
  ));

-- ── RPCs ────────────────────────────────────────────────────────────────────
-- Resolve an email to an existing recruiter and create a pending review row.
-- Must be server-side: clients cannot read auth.users.
create or replace function invite_reviewer(p_submission_id uuid, p_email text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid; v_role text; v_name text; v_count int; v_review reviews;
begin
  if not is_submission_owner(p_submission_id) then
    raise exception 'Not authorized to invite reviewers for this submission';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'No Ember recruiter account found for that email';
  end if;

  select role, full_name into v_role, v_name from profiles where id = v_uid;
  if v_role is distinct from 'recruiter' then
    raise exception 'That account is not a recruiter';
  end if;

  if exists (
    select 1 from submissions s join roles r on r.id = s.role_id
    where s.id = p_submission_id and r.recruiter_id = v_uid
  ) then
    raise exception 'You already own this submission';
  end if;

  select count(*) into v_count from reviews where submission_id = p_submission_id;
  if v_count >= 5 then
    raise exception 'You can invite up to 5 reviewers per submission';
  end if;

  if exists (select 1 from reviews where submission_id = p_submission_id and reviewer_id = v_uid) then
    raise exception 'That reviewer has already been invited';
  end if;

  insert into reviews (submission_id, reviewer_id)
  values (p_submission_id, v_uid)
  returning * into v_review;

  return jsonb_build_object(
    'id', v_review.id, 'reviewer_id', v_uid, 'full_name', v_name,
    'email', lower(trim(p_email)), 'status', v_review.status,
    'verdict', null, 'submitted_at', null
  );
end $$;
grant execute on function invite_reviewer(uuid, text) to authenticated;

-- Owner-only: full reviewer list + verdicts/notes for the live panel + aggregate.
create or replace function get_submission_reviews(p_submission_id uuid)
  returns table (
    id uuid, reviewer_id uuid, full_name text, photo_url text, email text,
    verdict text, status text, private_note text, submitted_at timestamptz
  ) language plpgsql security definer set search_path = public as $$
begin
  if not is_submission_owner(p_submission_id) then
    raise exception 'Not authorized';
  end if;
  return query
    select rv.id, rv.reviewer_id, p.full_name, p.photo_url, u.email::text,
           rv.verdict, rv.status, rv.private_note, rv.submitted_at
    from reviews rv
    join profiles p on p.id = rv.reviewer_id
    left join auth.users u on u.id = rv.reviewer_id
    where rv.submission_id = p_submission_id
    order by rv.created_at;
end $$;
grant execute on function get_submission_reviews(uuid) to authenticated;

-- Owner OR reviewer: minimal replay context (avoids depending on the
-- submission_details view's security model for reviewers).
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

-- ── Email notifications (best-effort; no-op until app.notify_url is set) ─────
-- Re-declare notify_email() to also handle the reviews table, preserving the
-- existing submissions/messages behavior.
create or replace function notify_email() returns trigger
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url     text := current_setting('app.notify_url', true);
  v_secret  text := current_setting('app.notify_secret', true);
  v_payload jsonb;
begin
  if v_url is null or v_url = '' then
    return coalesce(NEW, OLD);
  end if;

  if TG_TABLE_NAME = 'submissions' and TG_OP = 'INSERT' then
    v_payload := jsonb_build_object('type', 'submission_created', 'submission_id', NEW.id);
  elsif TG_TABLE_NAME = 'submissions' and TG_OP = 'UPDATE' then
    if NEW.status is distinct from OLD.status then
      v_payload := jsonb_build_object('type', 'status_updated', 'submission_id', NEW.id, 'new_status', NEW.status);
    else
      return NEW;
    end if;
  elsif TG_TABLE_NAME = 'messages' and TG_OP = 'INSERT' then
    v_payload := jsonb_build_object('type', 'message_created', 'message_id', NEW.id);
  elsif TG_TABLE_NAME = 'reviews' and TG_OP = 'INSERT' then
    v_payload := jsonb_build_object('type', 'review_requested', 'review_id', NEW.id);
  elsif TG_TABLE_NAME = 'reviews' and TG_OP = 'UPDATE' then
    if NEW.status = 'submitted' and OLD.status is distinct from 'submitted' then
      -- Notify the owner only once every reviewer has submitted.
      if not exists (
        select 1 from reviews r where r.submission_id = NEW.submission_id and r.status <> 'submitted'
      ) then
        v_payload := jsonb_build_object('type', 'reviews_complete', 'submission_id', NEW.submission_id);
      else
        return NEW;
      end if;
    else
      return NEW;
    end if;
  else
    return coalesce(NEW, OLD);
  end if;

  perform net.http_post(
    url     := v_url,
    body    := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(v_secret, '')
    )
  );
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists trg_notify_review_ins on reviews;
create trigger trg_notify_review_ins after insert on reviews
  for each row execute function notify_email();

drop trigger if exists trg_notify_review_upd on reviews;
create trigger trg_notify_review_upd after update on reviews
  for each row execute function notify_email();
