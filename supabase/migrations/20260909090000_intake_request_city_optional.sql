alter table public.intake_request_people
  drop constraint intake_request_people_phone_city_not_blank,
  alter column city drop not null,
  add constraint intake_request_people_phone_not_blank check (btrim(phone) <> '');

create function private.normalize_intake_request_person_city()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.city := nullif(nullif(btrim(new.city), ''), '__city_not_provided__');
  return new;
end;
$$;

create trigger normalize_intake_request_person_city before insert or update on public.intake_request_people
for each row execute function private.normalize_intake_request_person_city();

alter function public.create_intake_request(jsonb) rename to create_intake_request_with_required_city;

create function public.create_intake_request(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare normalized_people jsonb;
begin
  if current_setting('role', true) <> 'service_role' then raise exception 'Service role required'; end if;
  if jsonb_typeof(payload->'people') <> 'array' then raise exception 'Exactly two people are required'; end if;
  select jsonb_agg(jsonb_set(person, '{city}', to_jsonb(coalesce(nullif(btrim(person->>'city'), ''), '__city_not_provided__'::text))))
  into normalized_people from jsonb_array_elements(payload->'people') as people(person);
  return public.create_intake_request_with_required_city(jsonb_set(payload, '{people}', normalized_people));
end;
$$;

revoke execute on function public.create_intake_request(jsonb) from public, anon, authenticated;
grant execute on function public.create_intake_request(jsonb) to service_role;
revoke execute on function private.normalize_intake_request_person_city() from public, anon, authenticated;
