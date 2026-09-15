create or replace function private.current_user_can_manage_intake(target_request_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.intake_requests request
    where request.id = target_request_id
      and (
        private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])
        or (
          private.current_user_has_role(array['campus_lead']::public.app_role[])
          and exists (
            select 1
            from public.campus_lead_assignments scope
            join public.campuses campus on campus.id = scope.campus_id and campus.active
            join public.groups team on team.campus_id = scope.campus_id and team.group_type = 'campus_lead_team' and team.active
            join public.group_members membership on membership.group_id = team.id and membership.profile_id = auth.uid() and membership.ended_at is null
            where scope.profile_id = auth.uid()
              and scope.campus_id = request.campus_id
              and scope.ended_at is null
          )
        )
      )
  );
$$;

create or replace function public.invite_intake_request(target_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare actor uuid := auth.uid(); current_request public.intake_requests%rowtype; requester public.intake_request_people%rowtype; partner public.intake_request_people%rowtype; group_id uuid; invitation_ids jsonb := '[]'::jsonb; invitation_id uuid; person public.intake_request_people%rowtype;
begin
  if actor is null or not private.current_user_can_manage_intake(target_request_id) then raise exception 'Not authorized to invite this Intake Request'; end if;
  select * into current_request from public.intake_requests where id=target_request_id for update; if not found then raise exception 'Intake Request not found'; end if;
  select * into requester from public.intake_request_people where intake_request_id=target_request_id and person_position='requester'; select * into partner from public.intake_request_people where intake_request_id=target_request_id and person_position='partner';
  if requester.id is null or partner.id is null or requester.email=partner.email then raise exception 'Intake Request must have two people with different emails'; end if;
  insert into public.groups (campus_id,group_type,name) values (current_request.campus_id,'couple','Pending Couple invitation') returning id into group_id;
  for person in select * from public.intake_request_people where intake_request_id=target_request_id order by person_position loop insert into public.invitations (email,first_name,last_name,phone,intended_role,campus_id,group_id,invited_by) values (person.email,person.first_name,person.last_name,person.phone,'couple',current_request.campus_id,group_id,actor) returning id into invitation_id; invitation_ids:=invitation_ids||to_jsonb(invitation_id); end loop;
  update public.intake_requests set status='invited',invited_group_id=group_id where id=target_request_id; return jsonb_build_object('group_id',group_id,'invitation_ids',invitation_ids,'created',true);
end; $$;
