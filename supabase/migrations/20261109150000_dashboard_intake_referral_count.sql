create or replace function public.get_dashboard_intake_referral_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  is_admin boolean := private.current_user_has_role(array['admin', 'super_admin']::public.app_role[]);
  is_campus_lead boolean := private.current_user_has_role(array['campus_lead']::public.app_role[]);
begin
  if actor is null or not (is_admin or is_campus_lead) then
    raise exception 'Not authorized to view Dashboard Intake referrals';
  end if;

  return (
    select count(*)::integer
    from public.intake_requests request
    where request.status = 'referred_elsewhere'::public.intake_request_status
      and (select private.current_user_oversees_campus(request.campus_id))
  );
end;
$$;

revoke all on function public.get_dashboard_intake_referral_count() from public, anon, authenticated;
grant execute on function public.get_dashboard_intake_referral_count() to authenticated;
comment on function public.get_dashboard_intake_referral_count() is
  'Returns identity-free current Intake referral count for Admin/Super Admin globally or Campus Leads within active assigned campuses.';
