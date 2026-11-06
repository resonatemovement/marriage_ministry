do $$
declare
  meeting_endpoint text;
  onboarding_endpoint text;
begin
  select decrypted_secret into meeting_endpoint
  from vault.decrypted_secrets
  where name = 'meeting_reminder_endpoint_url';

  if meeting_endpoint is distinct from 'https://marriage-ministry-dev.vercel.app/api/cron/meeting-reminders' then
    raise exception 'DEV Meeting reminder endpoint must be configured before scheduling onboarding reminders';
  end if;

  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'meeting_reminder_cron_secret'
      and btrim(decrypted_secret) <> ''
  ) then
    raise exception 'DEV Cron credential must be configured before scheduling onboarding reminders';
  end if;

  onboarding_endpoint := replace(
    meeting_endpoint,
    '/api/cron/meeting-reminders',
    '/api/cron/onboarding-reminders'
  );

  if onboarding_endpoint is distinct from 'https://marriage-ministry-dev.vercel.app/api/cron/onboarding-reminders' then
    raise exception 'Onboarding reminder endpoint does not match the dedicated DEV host';
  end if;

  -- Replace only this feature's named job; leave Meeting reminders untouched.
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'onboarding-reminders-hourly';

  perform cron.schedule(
    'onboarding-reminders-hourly',
    '0 * * * *',
    $cron$
      select net.http_get(
        url := replace(
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'meeting_reminder_endpoint_url'
          ),
          '/api/cron/meeting-reminders',
          '/api/cron/onboarding-reminders'
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
