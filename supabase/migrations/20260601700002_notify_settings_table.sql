-- Supabase's hosted SQL role can't `ALTER DATABASE ... SET` custom GUCs, so read
-- the webhook config from a table instead. Re-runnable.
--
-- After this migration, configure (replace the secret) with a normal INSERT:
--   insert into app_settings(key, value) values
--     ('notify_url',    'https://vfcetqmbghkrlqmmtrkb.functions.supabase.co/send-notification-email'),
--     ('notify_secret', '<same value as the function''s NOTIFY_WEBHOOK_SECRET>')
--   on conflict (key) do update set value = excluded.value;

create table if not exists app_settings (
  key   text primary key,
  value text not null
);
alter table app_settings enable row level security; -- service-/definer-only

-- The non-secret URL can ship in the migration; the secret is inserted manually.
insert into app_settings (key, value) values
  ('notify_url', 'https://vfcetqmbghkrlqmmtrkb.functions.supabase.co/send-notification-email')
on conflict (key) do nothing;

create or replace function notify_email() returns trigger
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url     text;
  v_secret  text;
  v_payload jsonb;
begin
  select value into v_url    from app_settings where key = 'notify_url';
  select value into v_secret from app_settings where key = 'notify_secret';
  if v_url is null or v_url = '' then
    return coalesce(NEW, OLD); -- not configured yet → no-op
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
