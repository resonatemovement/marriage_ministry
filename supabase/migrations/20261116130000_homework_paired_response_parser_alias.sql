-- Fix the PL/pgSQL name collision between the input argument `value` and the
-- JSON array element column. Keep the parser's signature, immutability, search
-- path, validation, and access controls unchanged.
create or replace function private.homework_side_by_side_answer_column(value text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare parsed jsonb; row_value jsonb; row_id text; seen_ids text[] := '{}'::text[];
begin
  if value is null then return null; end if;
  parsed := value::jsonb;
  if jsonb_typeof(parsed) <> 'object'
    or (select count(*) from jsonb_object_keys(parsed)) <> 2
    or not (parsed ?& array['version','rows'])
    or jsonb_typeof(parsed -> 'version') <> 'number'
    or parsed ->> 'version' <> '1'
    or jsonb_typeof(parsed -> 'rows') <> 'array' then return null; end if;
  for row_value in
    select row_entry.element
    from jsonb_array_elements(parsed -> 'rows') as row_entry(element)
  loop
    if jsonb_typeof(row_value) <> 'object'
      or (select count(*) from jsonb_object_keys(row_value)) <> 2
      or not (row_value ?& array['id','value'])
      or jsonb_typeof(row_value -> 'id') <> 'string'
      or jsonb_typeof(row_value -> 'value') <> 'string' then return null; end if;
    row_id := row_value ->> 'id';
    if not coalesce(row_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false)
      or row_id = any(seen_ids) then return null; end if;
    seen_ids := array_append(seen_ids, row_id);
  end loop;
  return parsed;
exception when others then
  return null;
end;
$$;
