create or replace function private.homework_json_has_meaningful_text(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare child jsonb;
begin
  if value is null then return false; end if;

  if jsonb_typeof(value) = 'object' then
    if value ->> 'type' = 'text' and btrim(coalesce(value ->> 'text', '')) <> '' then
      return true;
    end if;

    if jsonb_typeof(value -> 'content') = 'array' then
      for child in select elements.value from jsonb_array_elements(value -> 'content') as elements(value) loop
        if private.homework_json_has_meaningful_text(child) then return true; end if;
      end loop;
    end if;
  elsif jsonb_typeof(value) = 'array' then
    for child in select elements.value from jsonb_array_elements(value) as elements(value) loop
      if private.homework_json_has_meaningful_text(child) then return true; end if;
    end loop;
  end if;

  return false;
end;
$$;

revoke insert, update, delete on public.homework_versions from authenticated;
grant select on public.homework_versions to authenticated;
