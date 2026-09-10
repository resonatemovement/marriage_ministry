create or replace function public.record_invitation_resend(target_invitation_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then
    raise exception 'Only Admin or Super Admin may record invitation resends';
  end if;

  update public.invitations
  set last_sent_at = now(),
      resend_count = resend_count + 1
  where id = target_invitation_id
    and status = 'pending';
  if not found then
    raise exception 'Pending invitation not found';
  end if;

  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (actor, 'invitation.resent', 'invitation', target_invitation_id, '{}'::jsonb);
end;
$$;

revoke execute on function public.record_invitation_resend(uuid) from public, anon, authenticated;
grant execute on function public.record_invitation_resend(uuid) to authenticated;
