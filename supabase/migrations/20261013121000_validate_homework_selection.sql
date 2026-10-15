-- Keep a stale non-null Homework selection as a real authoring error while allowing null to mean no Homework.
do $migration$
declare
  function_definition text := pg_get_functiondef(
    'public.save_session_homework_authoring_state(uuid,text,jsonb,boolean,uuid,jsonb,boolean,boolean,text)'::regprocedure
  );
  original_branch text := E'if target_homework_root_id is null then\n      if save_homework and jsonb_array_length(target_homework_blocks) > 0 then';
  corrected_branch text := E'if target_homework_root_id is null then\n      if target_homework_version_id is not null then\n        raise exception ''Select a valid Homework draft or remove the unavailable Homework selection'';\n      end if;\n      if save_homework and jsonb_array_length(target_homework_blocks) > 0 then';
begin
  if position(original_branch in function_definition) = 0 then
    raise exception 'Optional Homework authoring function changed; refusing to apply stale-selection validation';
  end if;
  execute replace(function_definition, original_branch, corrected_branch);
end;
$migration$;
