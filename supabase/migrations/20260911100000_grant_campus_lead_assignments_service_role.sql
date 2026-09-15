-- Trusted server maintenance needs to inspect, temporarily end, and clean scope rows.
-- Authenticated application users remain governed by the existing SELECT-only grant and RLS policy.
grant select, update, delete on public.campus_lead_assignments to service_role;
