-- Rollback-only, no-fixture runtime check for the DEV-scoped notification claim.
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  recipient_emails text[];
  claim_count integer;
  open_count integer;
begin
  select array_agg(lower(btrim(profile.email)) order by lower(btrim(profile.email)))
  into recipient_emails
  from public.profiles profile
  where profile.id in (
    '8e5aacb2-c645-4922-892d-50a4ee65d464'::uuid,
    'b7bf9f7b-45f8-4780-9243-b0a1d22ef095'::uuid
  ) and profile.status = 'active' and profile.email is not null;
  if cardinality(recipient_emails) <> 2 then
    raise exception 'Approved synthetic Counselor profiles are not both active and configured';
  end if;

  select count(*) into open_count
  from public.homework_completion_notification_deliveries
  where status in ('pending', 'claimed');
  if open_count <> 0 then
    raise exception 'DEV has pending deliveries; rollback-only no-target probe must not claim them';
  end if;

  select count(*) into claim_count
  from public.claim_due_homework_completion_dev_recipient_deliveries(25, recipient_emails);
  if claim_count <> 0 then
    raise exception 'Expected no eligible deliveries for the approved Couple';
  end if;
end;
$$;

rollback;
