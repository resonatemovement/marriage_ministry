do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'case_session_meetings'
  ) then
    alter publication supabase_realtime add table public.case_session_meetings;
  end if;
end
$$;
