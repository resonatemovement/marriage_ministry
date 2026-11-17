begin;

do $$
declare
  valid_payload text := '{"version":1,"rows":[{"id":"550e8400-e29b-41d4-a716-446655440000","value":"First line\nSecond line"},{"id":"550e8400-e29b-41d4-a716-446655440001","value":"Another response"}]}'::text;
  parsed jsonb;
begin
  parsed := private.homework_side_by_side_answer_column(valid_payload);
  if parsed is null or jsonb_array_length(parsed -> 'rows') <> 2
    or parsed #>> '{rows,0,value}' <> E'First line\nSecond line'
    or parsed #>> '{rows,1,id}' <> '550e8400-e29b-41d4-a716-446655440001' then
    raise exception 'Valid paired response payload did not preserve rows, IDs, and multiline text';
  end if;

  if private.homework_side_by_side_answer_column('{"version":1,"rows":[{"id":"550e8400-e29b-41d4-a716-446655440000","value":"A"},{"id":"550e8400-e29b-41d4-a716-446655440000","value":"duplicate"}]}') is not null then
    raise exception 'Duplicate paired response IDs were accepted';
  end if;

  if private.homework_side_by_side_answer_column('{"version":1,"rows":[{"id":"not-a-uuid","value":"A"}]}') is not null then
    raise exception 'Malformed paired response ID was accepted';
  end if;

  if private.homework_side_by_side_answer_column('{"version":1,"rows":[{"id":"550e8400-e29b-41d4-a716-446655440000","value":42}]}') is not null then
    raise exception 'Non-string paired response value was accepted';
  end if;
end;
$$;

rollback;
