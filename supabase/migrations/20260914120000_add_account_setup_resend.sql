create or replace function public.record_invitation_setup_resend(target_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare
  actor uuid := auth.uid();
  invitation public.invitations%rowtype;
  profile public.profiles%rowtype;
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then
    raise exception 'Only Admin or Super Admin may resend account setup';
  end if;

  select * into invitation from public.invitations where id = target_invitation_id for update;
  if not found or invitation.status <> 'accepted' or invitation.auth_user_id is null then
    raise exception 'Account setup is not available for this member';
  end if;

  select * into profile from public.profiles where id = invitation.auth_user_id for update;
  if not found or profile.status <> 'password_required' or lower(profile.email) <> invitation.email then
    raise exception 'This member has already established an account or requires password recovery';
  end if;

  update public.invitations
  set last_sent_at = now(),
      last_delivery_attempt_at = now(),
      last_delivery_succeeded_at = now(),
      delivery_attempt_count = delivery_attempt_count + 1,
      delivery_error_category = null,
      resend_count = resend_count + 1
  where id = invitation.id;

  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (actor, 'invitation.setup_resent', 'invitation', invitation.id, jsonb_build_object('auth_user_id', invitation.auth_user_id));
end;
$$;

revoke execute on function public.record_invitation_setup_resend(uuid) from public, anon, authenticated;
grant execute on function public.record_invitation_setup_resend(uuid) to authenticated;
