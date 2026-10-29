-- Case-scoped catalog metadata for authorized scheduling. This intentionally
-- returns no question wording, choices, scoring keys, responses, or results.
create function public.get_case_assessment_catalog(target_case_id uuid)
returns table(
  assessment_id uuid,
  title text,
  description text,
  published_version_id uuid,
  published_version_number integer,
  system_default_session_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.assessment_can_manage_case(target_case_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select definition.id, definition.title, definition.description,
    published.id, published.version_number, default_setting.session_id
  from public.assessment_definitions definition
  left join lateral (
    select version.id, version.version_number
    from public.assessment_versions version
    where version.assessment_id = definition.id and version.status = 'published'
    order by version.version_number desc
    limit 1
  ) published on true
  left join public.assessment_system_defaults default_setting on default_setting.assessment_id = definition.id
  order by definition.title, definition.id;
end;
$$;

revoke all on function public.get_case_assessment_catalog(uuid) from public, anon, authenticated;
grant execute on function public.get_case_assessment_catalog(uuid) to authenticated;
comment on function public.get_case_assessment_catalog(uuid) is
  'Returns Assessment catalog metadata and the latest published version for an authorized Case scheduler. Never returns questionnaire content or scoring keys.';
