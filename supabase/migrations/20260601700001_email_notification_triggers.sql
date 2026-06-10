-- Database webhooks → send-notification-email edge function, via pg_net.
-- Fires on the four high-value events. The function URL + shared secret are read
-- from database settings so no secrets live in this migration:
--
--   alter database postgres set app.notify_url    = 'https://<ref>.functions.supabase.co/send-notification-email';
--   alter database postgres set app.notify_secret = '<same value as the function''s NOTIFY_WEBHOOK_SECRET>';
--
-- Until app.notify_url is set, the trigger is a safe no-op.
create extension if not exists pg_net;

create or replace function notify_email() returns trigger
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url     text := current_setting('app.notify_url', true);
  v_secret  text := current_setting('app.notify_secret', true);
  v_payload jsonb;
begin
  if v_url is null or v_url = '' then
    return coalesce(NEW, OLD); -- not configured yet → no-op
  end if;

  if TG_TABLE_NAME = 'submissions' and TG_OP = 'INSERT' then
    v_payload := jsonb_build_object('type', 'submission_created', 'submission_id', NEW.id);
  elsif TG_TABLE_NAME = 'submissions' and TG_OP = 'UPDATE' then
    if NEW.status is distinct from OLD.status then
      v_payload := jsonb_build_object('type', 'status_updated', 'submission_id', NEW.id, 'new_status', NEW.status);
    else
      return NEW; -- status unchanged → nothing to notify
    end if;
  elsif TG_TABLE_NAME = 'messages' and TG_OP = 'INSERT' then
    v_payload := jsonb_build_object('type', 'message_created', 'message_id', NEW.id);
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

drop trigger if exists trg_notify_submission_ins on submissions;
create trigger trg_notify_submission_ins after insert on submissions
  for each row execute function notify_email();

drop trigger if exists trg_notify_submission_upd on submissions;
create trigger trg_notify_submission_upd after update on submissions
  for each row execute function notify_email();

drop trigger if exists trg_notify_message_ins on messages;
create trigger trg_notify_message_ins after insert on messages
  for each row execute function notify_email();
