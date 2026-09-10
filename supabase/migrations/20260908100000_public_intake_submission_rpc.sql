alter table public.intake_requests
  add constraint intake_requests_campus_selection_matches
  check (
    (campus_id is not null and campus_other is null)
    or (campus_id is null and campus_other is not null)
  ),
  add constraint intake_requests_goals_length check (length(goals) <= 10000),
  add constraint intake_requests_questions_length check (questions is null or length(questions) <= 10000),
  add constraint intake_requests_campus_other_length check (campus_other is null or length(campus_other) <= 250),
  add constraint intake_requests_referral_other_length check (referral_source_other is null or length(referral_source_other) <= 500);

alter table public.intake_request_people
  add constraint intake_request_people_name_city_lengths check (
    length(first_name) <= 100
    and length(last_name) <= 100
    and length(city) <= 150
  ),
  add constraint intake_request_people_phone_length check (length(phone) <= 24);

create or replace function public.create_intake_request(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
  campus uuid;
  wedding_date date;
  requested_support text[];
  item jsonb;
  requester_count integer := 0;
  partner_count integer := 0;
  requester_email text;
  partner_email text;
  date_value text := nullif(btrim(coalesce(payload->>'wedding_date', '')), '');
  campus_other_value text := nullif(btrim(coalesce(payload->>'campus_other', '')), '');
  referral_other_value text := nullif(btrim(coalesce(payload->>'referral_source_other', '')), '');
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if jsonb_typeof(payload) <> 'object' then
    raise exception 'Invalid submission payload';
  end if;

  if coalesce(payload->>'relationship_status', '') not in ('pre_engaged', 'engaged', 'married') then
    raise exception 'Invalid relationship status';
  end if;

  if coalesce(payload->>'currently_working_with_counselor', '') not in ('true', 'false') then
    raise exception 'Invalid counselor response';
  end if;

  if jsonb_typeof(payload->'requested_support') <> 'array'
    or jsonb_array_length(payload->'requested_support') = 0
    or exists (
      select 1
      from jsonb_array_elements_text(payload->'requested_support') as support(value)
      where value not in ('lay_counselor', 'professional_referral')
    )
    or (select count(*) from jsonb_array_elements_text(payload->'requested_support'))
      <> (select count(distinct value) from jsonb_array_elements_text(payload->'requested_support') as support(value)) then
    raise exception 'Invalid requested support';
  end if;

  if coalesce(payload->>'referral_source', '') not in ('church_announcements', 'mc', 'friend', 'ministry_leader', 'website', 'social_media', 'other')
    or ((payload->>'referral_source' = 'other') <> (referral_other_value is not null)) then
    raise exception 'Invalid referral source';
  end if;

  if payload->>'goals' is null or btrim(payload->>'goals') = '' or length(payload->>'goals') > 10000
    or length(coalesce(payload->>'questions', '')) > 10000
    or length(coalesce(referral_other_value, '')) > 500 then
    raise exception 'Invalid request details';
  end if;

  if date_value is not null then
    if date_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid wedding date';
    end if;
    begin
      wedding_date := date_value::date;
    exception when others then
      raise exception 'Invalid wedding date';
    end;
  end if;

  if nullif(btrim(coalesce(payload->>'campus_id', '')), '') is not null then
    begin
      campus := (payload->>'campus_id')::uuid;
    exception when others then
      raise exception 'Choose an active campus';
    end;
  end if;

  if (campus is not null) = (campus_other_value is not null) or length(coalesce(campus_other_value, '')) > 250 then
    raise exception 'Choose an active campus or provide another campus';
  end if;

  if campus is not null and not exists (
    select 1 from public.campuses where id = campus and active
  ) then
    raise exception 'Choose an active campus';
  end if;

  if jsonb_typeof(payload->'people') <> 'array' or jsonb_array_length(payload->'people') <> 2 then
    raise exception 'Exactly two people are required';
  end if;

  for item in select value from jsonb_array_elements(payload->'people') loop
    if jsonb_typeof(item) <> 'object'
      or coalesce(item->>'position', '') not in ('requester', 'partner')
      or btrim(coalesce(item->>'first_name', '')) = ''
      or btrim(coalesce(item->>'last_name', '')) = ''
      or btrim(coalesce(item->>'city', '')) = ''
      or length(coalesce(item->>'first_name', '')) > 100
      or length(coalesce(item->>'last_name', '')) > 100
      or length(coalesce(item->>'city', '')) > 150
      or lower(btrim(coalesce(item->>'email', ''))) !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
      or length(coalesce(item->>'phone', '')) > 24
      or btrim(coalesce(item->>'phone', '')) !~ '^[+][0-9]{7,15}$'
      or jsonb_typeof(item->'connections') <> 'array'
      or jsonb_array_length(item->'connections') = 0
      or exists (
        select 1
        from jsonb_array_elements_text(item->'connections') as connection(value)
        where value not in ('member', 'regular_attendee', 'mc', 'occasionally', 'not_attend')
      )
      or (select count(*) from jsonb_array_elements_text(item->'connections'))
        <> (select count(distinct value) from jsonb_array_elements_text(item->'connections') as connection(value)) then
      raise exception 'Invalid person data';
    end if;

    if item->>'position' = 'requester' then
      requester_count := requester_count + 1;
      requester_email := lower(btrim(item->>'email'));
    else
      partner_count := partner_count + 1;
      partner_email := lower(btrim(item->>'email'));
    end if;
  end loop;

  if requester_count <> 1 or partner_count <> 1 or requester_email = partner_email then
    raise exception 'Exactly one requester and one partner with different email addresses are required';
  end if;

  select array_agg(value order by value) into requested_support
  from jsonb_array_elements_text(payload->'requested_support') as support(value);

  insert into public.intake_requests (
    relationship_status, wedding_date, campus_id, campus_other,
    currently_working_with_counselor, requested_support, goals, questions,
    referral_source, referral_source_other
  ) values (
    (payload->>'relationship_status')::public.intake_relationship_status,
    wedding_date, campus, campus_other_value,
    (payload->>'currently_working_with_counselor')::boolean, requested_support,
    btrim(payload->>'goals'), nullif(btrim(coalesce(payload->>'questions', '')), ''),
    payload->>'referral_source', referral_other_value
  ) returning id into request_id;

  for item in select value from jsonb_array_elements(payload->'people') loop
    insert into public.intake_request_people (
      intake_request_id, person_position, first_name, last_name, email, phone, city, resonate_connections
    ) values (
      request_id, (item->>'position')::public.intake_request_person_position,
      btrim(item->>'first_name'), btrim(item->>'last_name'), lower(btrim(item->>'email')),
      btrim(item->>'phone'), btrim(item->>'city'), item->'connections'
    );
  end loop;

  insert into public.audit_events (event_type, entity_type, entity_id, details)
  values ('intake_request.submitted', 'intake_request', request_id, jsonb_build_object('source', 'public_request'));

  return request_id;
end;
$$;

revoke execute on function public.create_intake_request(jsonb) from public, anon, authenticated;
grant execute on function public.create_intake_request(jsonb) to service_role;
