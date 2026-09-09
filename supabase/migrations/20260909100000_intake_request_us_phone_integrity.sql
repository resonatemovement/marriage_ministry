alter function public.create_intake_request(jsonb) rename to create_intake_request_with_city_optional;

create function public.create_intake_request(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare requester_phone text; partner_phone text;
begin
  if current_setting('role', true) <> 'service_role' then raise exception 'Service role required'; end if;
  if jsonb_typeof(payload->'people') <> 'array' or jsonb_array_length(payload->'people') <> 2 then raise exception 'Exactly two people are required'; end if;
  select item->>'phone' into requester_phone from jsonb_array_elements(payload->'people') item where item->>'position' = 'requester';
  select item->>'phone' into partner_phone from jsonb_array_elements(payload->'people') item where item->>'position' = 'partner';
  if coalesce(requester_phone, '') !~ '^[+]1[0-9]{10}$' or coalesce(partner_phone, '') !~ '^[+]1[0-9]{10}$' then raise exception 'Invalid U.S. phone number'; end if;
  if requester_phone = partner_phone then raise exception 'Requester and partner phone numbers must be different'; end if;
  return public.create_intake_request_with_city_optional(payload);
end;
$$;

revoke execute on function public.create_intake_request(jsonb) from public, anon, authenticated;
grant execute on function public.create_intake_request(jsonb) to service_role;
