-- Retire the obsolete operational relationship without deleting its history.
update public.campus_lead_counselor_assignments
set ended_at = coalesce(ended_at, now())
where ended_at is null;

create or replace function private.reject_retired_campus_lead_counselor_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Campus Lead Counselor operational assignments are retired';
end;
$$;

drop trigger if exists reject_retired_campus_lead_counselor_assignment_before_write on public.campus_lead_counselor_assignments;
create trigger reject_retired_campus_lead_counselor_assignment_before_write
before insert or update on public.campus_lead_counselor_assignments
for each row execute function private.reject_retired_campus_lead_counselor_assignment();

revoke all on function public.assign_campus_lead_counselor(uuid, uuid) from public;
revoke all on function public.unassign_campus_lead_counselor(uuid, uuid) from public;
