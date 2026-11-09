import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Dashboard Team Availability RPC migration", () => {
  it("returns only active team summaries and direct active Counselor-of-record counts", () => {
    const migration = readFileSync("supabase/migrations/20261109110000_dashboard_team_availability.sql", "utf8");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("private.current_user_is_active()");
    expect(migration).toContain("private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])");
    expect(migration).toContain("private.current_user_has_role(array['campus_lead']::public.app_role[])");
    expect(migration).toContain("private.current_user_oversees_campus(team.campus_id)");
    expect(migration).toContain("team.active");
    expect(migration).toContain("team.group_type in ('campus_lead_team', 'coach_team', 'counselor_team')");
    expect(migration).toContain("assignment.assignment_type = 'counselor'");
    expect(migration).toContain("assignment.assigned_group_id = team.id");
    expect(migration).toContain("assignment.ended_at is null");
    expect(migration).toContain("count(distinct couple.id)");
    expect(migration).toContain("couple.active");
    expect(migration).toContain("revoke all on function public.get_dashboard_team_availability() from public, anon");
    expect(migration).toContain("grant execute on function public.get_dashboard_team_availability() to authenticated");
    expect(migration).not.toContain("first_name");
    expect(migration).not.toContain("homework");
    expect(migration).not.toContain("assessment");
  });
});
