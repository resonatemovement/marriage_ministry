alter table public.invitations
  add column auth_user_id uuid references auth.users(id) on delete set null,
  add column last_delivery_attempt_at timestamptz,
  add column last_delivery_succeeded_at timestamptz,
  add column delivery_attempt_count integer not null default 0 check (delivery_attempt_count >= 0),
  add column delivery_error_category text;

create index invitations_auth_user_idx on public.invitations (auth_user_id);

create or replace function public.record_invitation_delivery(
  target_invitation_id uuid,
  target_auth_user_id uuid,
  succeeded boolean,
  failure_category text default null
)
returns void
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then
    raise exception 'Only Admin or Super Admin may record invitation delivery';
  end if;
  update public.invitations
  set last_delivery_attempt_at = now(),
      delivery_attempt_count = delivery_attempt_count + 1,
      last_delivery_succeeded_at = case when succeeded then now() else last_delivery_succeeded_at end,
      auth_user_id = case when succeeded then target_auth_user_id else auth_user_id end,
      delivery_error_category = case when succeeded then null else failure_category end
  where id = target_invitation_id and status = 'pending';
  if not found then raise exception 'Pending invitation not found'; end if;
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (actor, case when succeeded then 'invitation.sent' else 'invitation.delivery_failed' end, 'invitation', target_invitation_id,
    jsonb_build_object('failure_category', failure_category));
end;
$$;

revoke execute on function public.record_invitation_delivery(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.record_invitation_delivery(uuid, uuid, boolean, text) to authenticated;
