alter table public.global_reminder_settings
  add column intake_ready_for_review_hours integer not null default 48
    constraint global_reminder_settings_intake_ready_for_review_hours_check check (intake_ready_for_review_hours between 1 and 720),
  add column intake_under_review_hours integer not null default 72
    constraint global_reminder_settings_intake_under_review_hours_check check (intake_under_review_hours between 1 and 720),
  add column intake_ready_to_invite_hours integer not null default 168
    constraint global_reminder_settings_intake_ready_to_invite_hours_check check (intake_ready_to_invite_hours between 1 and 720),
  add column intake_invited_onboarding_hours integer not null default 168
    constraint global_reminder_settings_intake_invited_onboarding_hours_check check (intake_invited_onboarding_hours between 1 and 720);

create or replace function public.update_global_intake_alert_settings(
  next_ready_for_review_hours integer,
  next_under_review_hours integer,
  next_ready_to_invite_hours integer,
  next_invited_onboarding_hours integer
)
returns table (
  ready_for_review_hours integer,
  under_review_hours integer,
  ready_to_invite_hours integer,
  invited_onboarding_hours integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not (select private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])) then
    raise exception 'Not authorized';
  end if;

  if next_ready_for_review_hours is null or next_ready_for_review_hours not between 1 and 720
    or next_under_review_hours is null or next_under_review_hours not between 1 and 720
    or next_ready_to_invite_hours is null or next_ready_to_invite_hours not between 1 and 720
    or next_invited_onboarding_hours is null or next_invited_onboarding_hours not between 1 and 720 then
    raise exception 'Intake alert thresholds must be whole hours between 1 and 720';
  end if;

  return query
  update public.global_reminder_settings settings
  set intake_ready_for_review_hours = next_ready_for_review_hours,
      intake_under_review_hours = next_under_review_hours,
      intake_ready_to_invite_hours = next_ready_to_invite_hours,
      intake_invited_onboarding_hours = next_invited_onboarding_hours,
      updated_at = clock_timestamp(),
      updated_by = actor
  where settings.id = 'global'
  returning settings.intake_ready_for_review_hours,
    settings.intake_under_review_hours,
    settings.intake_ready_to_invite_hours,
    settings.intake_invited_onboarding_hours,
    settings.updated_at;

  if not found then
    raise exception 'Intake alert settings are unavailable';
  end if;
end;
$$;

revoke all on function public.update_global_intake_alert_settings(integer, integer, integer, integer) from public, anon;
grant execute on function public.update_global_intake_alert_settings(integer, integer, integer, integer) to authenticated;

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
    select
      value.intake_ready_for_review_hours,
      value.intake_under_review_hours,
      value.intake_ready_to_invite_hours,
      value.intake_invited_onboarding_hours
    from public.global_reminder_settings value
    where value.id = 'global'
  ), scoped_requests as (
    select
      request.id,
      request.campus_id,
      campus.name as campus_name,
      request.status::text as request_status,
      request.submitted_at,
      status_time.changed_at as status_entered_at
    from public.intake_requests request
    join public.campuses campus on campus.id = request.campus_id
    left join lateral (
      select history.changed_at
      from public.intake_request_status_history history
      where history.intake_request_id = request.id
        and history.to_status = request.status
      order by history.changed_at desc, history.id desc
      limit 1
    ) status_time on true
    where (target_campus_id is null or request.campus_id = target_campus_id)
      and (select private.current_user_oversees_campus(request.campus_id))
  ), invitation_progress as (
    select
      request.id as request_id,
      count(invitation.id)::integer as invitation_count,
      count(distinct lower(invitation.email))::integer as distinct_invited_emails,
      count(*) filter (
        where not coalesce(
          invitation.status = 'accepted'::public.invitation_status
          and profile.onboarding_completed_at is not null,
          false
        )
      )::integer as incomplete_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'personPosition', person.person_position,
            'firstName', person.first_name,
            'lastName', person.last_name
          ) order by person.person_position
        ) filter (
          where not coalesce(
            invitation.status = 'accepted'::public.invitation_status
            and profile.onboarding_completed_at is not null,
            false
          )
        ),
        '[]'::jsonb
      ) as incomplete_partners
    from scoped_requests request
    join public.intake_request_people person on person.intake_request_id = request.id
    left join public.invitations invitation
      on invitation.group_id = (
        select intake.invited_group_id
        from public.intake_requests intake
        where intake.id = request.id
      )
      and lower(invitation.email) = lower(person.email)
      and invitation.intended_role = 'couple'::public.app_role
    left join public.profiles profile on profile.id = invitation.auth_user_id
    where request.request_status = 'invited'
    group by request.id
  ), qualified as (
    select
      request.*,
      case request.request_status
        when 'ready_for_review' then settings.intake_ready_for_review_hours
        when 'under_review' then settings.intake_under_review_hours
        when 'ready_to_invite' then settings.intake_ready_to_invite_hours
        when 'invited' then settings.intake_invited_onboarding_hours
      end as threshold,
      case when request.status_entered_at is null then null
        else extract(epoch from (statement_timestamp() - request.status_entered_at)) / 3600
      end as age_hours,
      progress.invitation_count,
      progress.distinct_invited_emails,
      progress.incomplete_count,
      progress.incomplete_partners
    from scoped_requests request
    cross join settings
    left join invitation_progress progress on progress.request_id = request.id
    where request.request_status <> 'closed'
  )
  select
    eligible.id,
    eligible.campus_id,
    eligible.campus_name,
    eligible.request_status,
    case
      when eligible.request_status = 'ready_for_review' and eligible.age_hours >= eligible.threshold then 'stalled_ready_for_review'
      when eligible.request_status = 'ready_for_review' then 'new_ready_for_review'
      when eligible.request_status = 'under_review' then 'stalled_under_review'
      when eligible.request_status = 'ready_to_invite' then 'stalled_ready_to_invite'
      when eligible.request_status = 'invited' then 'incomplete_onboarding'
    end,
    eligible.submitted_at,
    eligible.status_entered_at,
    eligible.threshold,
    eligible.age_hours,
    case when eligible.request_status = 'invited' then eligible.incomplete_partners else null end
  from qualified eligible
  where eligible.status_entered_at is not null
    and (
      eligible.request_status = 'ready_for_review'
      or (eligible.request_status in ('under_review', 'ready_to_invite') and eligible.age_hours >= eligible.threshold)
      or (
        eligible.request_status = 'invited'
        and eligible.age_hours >= eligible.threshold
        and eligible.invitation_count = 2
        and eligible.distinct_invited_emails = 2
        and eligible.incomplete_count > 0
      )
    )
  order by eligible.status_entered_at, eligible.id;
end;
$$;

revoke all on function public.get_intake_request_alerts(uuid) from public, anon;
grant execute on function public.get_intake_request_alerts(uuid) to authenticated;
comment on function public.get_intake_request_alerts(uuid) is
  'Returns one current Intake Request alert per qualifying request. Admin/Super Admin receive global scope; Campus Leads are limited to assigned active campuses. Missing status history and incomplete invitation linkage fail closed.';
