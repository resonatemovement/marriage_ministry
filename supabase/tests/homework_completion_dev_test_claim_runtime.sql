-- Rollback-only isolation check for the targeted DEV notification claim.
-- It deliberately selects a non-DEV-Test pending cycle and verifies that the
-- restricted test RPC rejects it without changing any cycle/delivery history.
begin;

do $verify_target_scope$
declare
  target record;
  before_state jsonb;
  after_state jsonb;
  rejected boolean := false;
begin
  select n.id as notification_id, n.case_session_id, c.couple_group_id
  into target
  from public.homework_completion_notifications as n
  join public.case_sessions as s on s.id = n.case_session_id
  join public.counseling_cases as c on c.id = s.counseling_case_id
  join public.groups as g on g.id = c.couple_group_id
  where n.status = 'pending'
    and g.name <> 'DEV Test Couple'
  order by n.created_at
  limit 1;

  if target.notification_id is null then
    raise exception 'No unrelated pending cycle is available for the isolation check';
  end if;

  select jsonb_build_object(
    'notification_status', n.status,
    'deliveries', coalesce(
      jsonb_agg(jsonb_build_object(
        'id', d.id,
        'status', d.status,
        'claim_sequence', d.claim_sequence,
        'claim_token', d.claim_token,
        'next_attempt_at', d.next_attempt_at,
        'attempt_count', (
          select count(*)
          from public.homework_completion_notification_attempts as a
          where a.delivery_id = d.id
        )
      ) order by d.id),
      '[]'::jsonb
    )
  )
  into before_state
  from public.homework_completion_notifications as n
  left join public.homework_completion_notification_deliveries as d
    on d.notification_id = n.id
  where n.id = target.notification_id
  group by n.id, n.status;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    perform *
    from public.claim_homework_completion_dev_test_notification(
      target.notification_id,
      target.case_session_id,
      target.couple_group_id,
      array['synthetic-a@mailinator.com', 'synthetic-b@mailinator.com']
    );
  exception when raise_exception then
    if sqlerrm = 'DEV test notification identity or eligibility check failed' then
      rejected := true;
    else
      raise;
    end if;
  end;

  if not rejected then
    raise exception 'Target-only RPC did not reject the unrelated Couple cycle';
  end if;

  select jsonb_build_object(
    'notification_status', n.status,
    'deliveries', coalesce(
      jsonb_agg(jsonb_build_object(
        'id', d.id,
        'status', d.status,
        'claim_sequence', d.claim_sequence,
        'claim_token', d.claim_token,
        'next_attempt_at', d.next_attempt_at,
        'attempt_count', (
          select count(*)
          from public.homework_completion_notification_attempts as a
          where a.delivery_id = d.id
        )
      ) order by d.id),
      '[]'::jsonb
    )
  )
  into after_state
  from public.homework_completion_notifications as n
  left join public.homework_completion_notification_deliveries as d
    on d.notification_id = n.id
  where n.id = target.notification_id
  group by n.id, n.status;

  if before_state is distinct from after_state then
    raise exception 'The unrelated notification or delivery state changed';
  end if;

  raise notice 'PASS: unrelated cycle rejected and delivery state stayed unchanged';
end
$verify_target_scope$;

rollback;

select 'PASS: unrelated pending notification rejected without state changes' as result;
