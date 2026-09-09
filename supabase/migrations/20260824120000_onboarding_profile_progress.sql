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
  normalized_first_name text := btrim(target_first_name);
  normalized_last_name text := btrim(target_last_name);
  normalized_phone text := btrim(target_phone);
  phone_digits text;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  if normalized_first_name = '' then raise exception 'First name is required'; end if;
  if normalized_last_name = '' then raise exception 'Last name is required'; end if;
  phone_digits := regexp_replace(normalized_phone, '[^0-9]', '', 'g');
  if normalized_phone !~ '^[0-9+(). -]+$' or length(phone_digits) < 7 or length(phone_digits) > 15 then
    raise exception 'Enter a valid phone number';
  end if;

  update public.profiles
  set first_name = normalized_first_name,
      last_name = normalized_last_name,
      phone = normalized_phone
  where id = actor
    and status = 'invited';

  if not found then raise exception 'Onboarding is not available for this account'; end if;

  return jsonb_build_object('first_name', normalized_first_name, 'last_name', normalized_last_name, 'phone', normalized_phone);
end;
$$;

revoke execute on function public.save_onboarding_profile(text, text, text) from public, anon, authenticated;
grant execute on function public.save_onboarding_profile(text, text, text) to authenticated;
