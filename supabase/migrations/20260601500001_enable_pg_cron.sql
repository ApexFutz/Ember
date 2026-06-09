-- Enable pg_cron and register the every-minute time-limit sweep so expired
-- assessments auto-submit even when the candidate's tab is closed. Re-runnable.
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('enforce-time-limits')
    where exists (select 1 from cron.job where jobname = 'enforce-time-limits');
  perform cron.schedule('enforce-time-limits', '* * * * *', 'select enforce_time_limit()');
end $$;
