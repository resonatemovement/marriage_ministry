create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'meeting_reminder_endpoint_url'
      and btrim(decrypted_secret) <> ''
  ) then
    raise exception 'Vault secret meeting_reminder_endpoint_url must be configured before scheduling Meeting reminders';
  end if;

  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'meeting_reminder_cron_secret'
      and btrim(decrypted_secret) <> ''
  ) then
    raise exception 'Vault secret meeting_reminder_cron_secret must be configured before scheduling Meeting reminders';
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'meeting-reminders-hourly';

  perform cron.schedule(
    'meeting-reminders-hourly',
    '0 * * * *',
    $cron$
      select net.http_get(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'meeting_reminder_endpoint_url'
        ),
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'meeting_reminder_cron_secret'
          )
        ),
        timeout_milliseconds := 30000
      ) as request_id;
    $cron$
  );
end;
$$;
