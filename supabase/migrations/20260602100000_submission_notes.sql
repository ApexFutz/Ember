-- Private recruiter notes per submission. Kept in a dedicated table (not a
-- column on submissions) because RLS is row-level: a candidate can read their
-- own submissions row, so a column there would be exposable. This table has no
-- candidate policy at all — only the recruiter who owns the role can read/write,
-- so notes are unreachable by candidates via any query path. Re-runnable.

create table if not exists submission_notes (
  submission_id uuid primary key references submissions(id) on delete cascade,
  body          text not null default '',
  updated_at    timestamptz not null default now()
);

alter table submission_notes enable row level security;
drop policy if exists "sn recruiter all" on submission_notes;
create policy "sn recruiter all" on submission_notes for all
  using (
    exists (
      select 1 from submissions s join roles r on r.id = s.role_id
      where s.id = submission_notes.submission_id and r.recruiter_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from submissions s join roles r on r.id = s.role_id
      where s.id = submission_notes.submission_id and r.recruiter_id = auth.uid()
    )
  );

-- Migrate any existing notes off the submissions column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'submissions' and column_name = 'recruiter_notes'
  ) then
    insert into submission_notes (submission_id, body)
      select id, recruiter_notes from submissions
      where recruiter_notes is not null and recruiter_notes <> ''
      on conflict (submission_id) do nothing;
  end if;
end $$;
