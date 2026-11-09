create or replace function public.take_intake_request_action(
  target_request_id uuid,
  target_action text,
  target_reason_code text default null,
  target_reason_detail text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  current_request public.intake_requests%rowtype;
  next_status public.intake_request_status;
  action_note text;
  normalized_detail text := nullif(btrim(coalesce(target_reason_detail, '')), '');
begin
  if actor is null or not (select private.current_user_can_manage_intake(target_request_id)) then
    raise exception 'Not authorized to manage this Intake Request';
  end if;

  select * into current_request from public.intake_requests where id = target_request_id for update;
  if not found then raise exception 'Intake Request not found'; end if;

  if target_action = 'start_review' and current_request.status = 'ready_for_review' then
    next_status := 'under_review'; action_note := 'Review Started';
  elsif target_action = 'reopen' and current_request.status in ('closed', 'referred_elsewhere') then
    next_status := 'under_review'; action_note := 'Request Reopened';
  elsif target_action = 'close' and current_request.status in ('ready_for_review', 'under_review') then
    if target_reason_code not in ('couple_withdrew', 'professional_referral', 'not_appropriate', 'duplicate_request', 'unable_to_contact', 'other') then
      raise exception 'Choose a valid close reason';
    end if;
    if (target_reason_code = 'other') <> (normalized_detail is not null) then
      raise exception 'Provide a short reason when Other is selected';
    end if;
    next_status := 'closed'; action_note := 'Request Closed';
  elsif target_action = 'refer_elsewhere' and current_request.status in ('ready_for_review', 'under_review') then
    if normalized_detail is null or char_length(normalized_detail) not between 10 and 500 then
      raise exception 'Referral reason must be between 10 and 500 characters';
    end if;
    next_status := 'referred_elsewhere'; action_note := normalized_detail;
  else
    raise exception 'Invalid Intake Request action';
  end if;

  update public.intake_requests set status = next_status where id = target_request_id;
  insert into public.intake_request_status_history
    (intake_request_id, from_status, to_status, changed_by, note, reason_code, reason_detail)
  values
    (target_request_id, current_request.status, next_status, actor, action_note,
      case when target_action = 'close' then target_reason_code end,
      case when target_action = 'close' and target_reason_code = 'other' then normalized_detail end);
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (
    actor,
    'intake_request.' || target_action,
    'intake_request',
    target_request_id,
    jsonb_build_object(
      'from_status', current_request.status,
      'to_status', next_status,
      'reason_code', case when target_action = 'close' then target_reason_code end,
      'referral_reason', case when target_action = 'refer_elsewhere' then normalized_detail end
    )
  );
end;
$$;

-- Keep the legacy status RPC Admin-only and ensure referred requests can only
-- return to review through the audited reopen action above.
create or replace function public.update_intake_request_status(target_request_id uuid, next_status public.intake_request_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  current_request public.intake_requests%rowtype;
  allowed boolean := false;
begin
  if actor is null or not (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])) then
    raise exception 'Only Admin or Super Admin may manage Intake Requests';
  end if;
  select * into current_request from public.intake_requests where id = target_request_id for update;
  if not found then raise exception 'Intake Request not found'; end if;
  if next_status = 'invited' then raise exception 'Invited is managed by the invitation workflow'; end if;
  allowed := case current_request.status
    when 'ready_for_review' then next_status in ('under_review', 'closed')
    when 'under_review' then next_status in ('ready_to_invite', 'closed')
    when 'ready_to_invite' then next_status in ('under_review', 'closed')
    when 'closed' then next_status = 'under_review'
    when 'invited' then false
    when 'referred_elsewhere' then false
  end;
  if allowed is distinct from true then raise exception 'Invalid Intake Request status transition'; end if;
  update public.intake_requests set status = next_status where id = target_request_id;
  insert into public.intake_request_status_history (intake_request_id, from_status, to_status, changed_by)
  values (target_request_id, current_request.status, next_status, actor);
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (actor, 'intake_request.status_updated', 'intake_request', target_request_id,
    jsonb_build_object('from_status', current_request.status, 'to_status', next_status));
end;
$$;

create or replace function public.get_intake_request_alerts(target_campus_id uuid default null)
returns table (
  request_id uuid,
  campus_id uuid,
  campus_name text,
  request_status text,
  alert_type text,
  submitted_at timestamptz,
  status_entered_at timestamptz,
  threshold_hours integer,
  elapsed_hours numeric,
  incomplete_partners jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not (select private.current_user_has_role(array['admin', 'super_admin', 'campus_lead']::public.app_role[])) then
    raise exception 'Not authorized to view Intake Request alerts';
  end if;
  if target_campus_id is not null and not (select private.current_user_oversees_campus(target_campus_id)) then
    raise exception 'Not authorized to view Intake Request alerts for this campus';
  end if;

  return query
  with settings as (
    select value.intake_ready_for_review_hours, value.intake_under_review_hours,
      value.intake_ready_to_invite_hours, value.intake_invited_onboarding_hours
    from public.global_reminder_settings value where value.id = 'global'
  ), scoped_requests as (
    select request.id, request.campus_id, campus.name as campus_name,
      request.status::text as request_status, request.submitted_at,
      status_time.changed_at as status_entered_at
    from public.intake_requests request
    join public.campuses campus on campus.id = request.campus_id
    left join lateral (
      select history.changed_at
      from public.intake_request_status_history history
      where history.intake_request_id = request.id and history.to_status = request.status
      order by history.changed_at desc, history.id desc limit 1
    ) status_time on true
    where (target_campus_id is null or request.campus_id = target_campus_id)
      and (select private.current_user_oversees_campus(request.campus_id))
  ), invitation_progress as (
    select request.id as request_id,
      count(invitation.id)::integer as invitation_count,
      count(distinct lower(invitation.email))::integer as distinct_invited_emails,
      count(*) filter (where not coalesce(
        invitation.status = 'accepted'::public.invitation_status and profile.onboarding_completed_at is not null,
        false
      ))::integer as incomplete_count,
      coalesce(jsonb_agg(jsonb_build_object(
        'personPosition', person.person_position,
        'firstName', person.first_name,
        'lastName', person.last_name
      ) order by person.person_position) filter (where not coalesce(
        invitation.status = 'accepted'::public.invitation_status and profile.onboarding_completed_at is not null,
        false
      )), '[]'::jsonb) as incomplete_partners
    from scoped_requests request
    join public.intake_request_people person on person.intake_request_id = request.id
    left join public.invitations invitation
      on invitation.group_id = (select intake.invited_group_id from public.intake_requests intake where intake.id = request.id)
      and lower(invitation.email) = lower(person.email)
      and invitation.intended_role = 'couple'::public.app_role
    left join public.profiles profile on profile.id = invitation.auth_user_id
    where request.request_status = 'invited'
    group by request.id
  ), qualified as (
    select request.*,
      case request.request_status
        when 'ready_for_review' then settings.intake_ready_for_review_hours
        when 'under_review' then settings.intake_under_review_hours
        when 'ready_to_invite' then settings.intake_ready_to_invite_hours
        when 'invited' then settings.intake_invited_onboarding_hours
      end as threshold,
      case when request.status_entered_at is null then null
        else extract(epoch from (statement_timestamp() - request.status_entered_at)) / 3600
      end as age_hours,
      progress.invitation_count, progress.distinct_invited_emails,
      progress.incomplete_count, progress.incomplete_partners
    from scoped_requests request
    cross join settings
    left join invitation_progress progress on progress.request_id = request.id
    where request.request_status not in ('closed', 'referred_elsewhere')
  )
  select eligible.id, eligible.campus_id, eligible.campus_name, eligible.request_status,
    case
      when eligible.request_status = 'ready_for_review' and eligible.age_hours >= eligible.threshold then 'stalled_ready_for_review'
      when eligible.request_status = 'ready_for_review' then 'new_ready_for_review'
      when eligible.request_status = 'under_review' then 'stalled_under_review'
      when eligible.request_status = 'ready_to_invite' then 'stalled_ready_to_invite'
      when eligible.request_status = 'invited' then 'incomplete_onboarding'
    end,
    eligible.submitted_at, eligible.status_entered_at, eligible.threshold, eligible.age_hours,
    case when eligible.request_status = 'invited' then eligible.incomplete_partners else null end
  from qualified eligible
  where eligible.status_entered_at is not null
    and (
      eligible.request_status = 'ready_for_review'
      or (eligible.request_status in ('under_review', 'ready_to_invite') and eligible.age_hours >= eligible.threshold)
      or (eligible.request_status = 'invited' and eligible.age_hours >= eligible.threshold
        and eligible.invitation_count = 2 and eligible.distinct_invited_emails = 2
        and eligible.incomplete_count > 0)
    )
  order by eligible.status_entered_at, eligible.id;
end;
$$;

revoke all on function public.get_intake_request_alerts(uuid) from public, anon;
grant execute on function public.get_intake_request_alerts(uuid) to authenticated;
