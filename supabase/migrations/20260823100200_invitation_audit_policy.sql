create policy audit_events_admin_insert on public.audit_events for insert to authenticated
with check ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));
