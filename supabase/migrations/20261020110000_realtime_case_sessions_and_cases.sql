do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'case_sessions'
  ) then
    alter publication supabase_realtime add table public.case_sessions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'counseling_cases'
  ) then
    alter publication supabase_realtime add table public.counseling_cases;
  end if;
end
$$;
