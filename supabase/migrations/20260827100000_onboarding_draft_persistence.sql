create or replace function public.save_onboarding_profile(
  target_first_name text,
  target_last_name text,
  target_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  normalized_first_name text := nullif(btrim(target_first_name), '');
  normalized_last_name text := nullif(btrim(target_last_name), '');
  normalized_phone text;
  phone_digits text;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  if target_phone is not null and btrim(target_phone) <> '' then
    phone_digits := regexp_replace(target_phone, '[^0-9]', '', 'g');
    if target_phone !~ '^[0-9+(). -]+$' or length(phone_digits) < 7 or length(phone_digits) > 15 then
      raise exception 'Enter a valid phone number';
    end if;
    normalized_phone := case when length(phone_digits) = 10 then '+1' || phone_digits when length(phone_digits) = 11 and left(phone_digits, 1) = '1' then '+' || phone_digits else '+' || phone_digits end;
  end if;

  update public.profiles
  set first_name = coalesce(normalized_first_name, first_name),
      last_name = coalesce(normalized_last_name, last_name),
      phone = coalesce(normalized_phone, phone)
  where id = actor and status = 'onboarding';
  if not found then raise exception 'Onboarding is not available for this account'; end if;
  return jsonb_build_object('first_name', coalesce(normalized_first_name, ''), 'last_name', coalesce(normalized_last_name, ''), 'phone', coalesce(normalized_phone, ''));
end;
$$;

revoke execute on function public.save_onboarding_profile(text, text, text) from public, anon, authenticated;
grant execute on function public.save_onboarding_profile(text, text, text) to authenticated;
