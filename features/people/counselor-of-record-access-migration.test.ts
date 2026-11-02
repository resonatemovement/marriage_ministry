import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261102100000_align_counselor_of_record_access.sql", "utf8");

describe("Counselor-of-record access migration", () => {
  it("keeps Admin and Super Admin access while limiting staff Couple access to active Counselor-of-record team membership", () => {
    const caseAccess = migration.slice(migration.indexOf("create or replace function private.current_user_can_access_case"), migration.indexOf("create or replace function private.current_user_can_manage_counseling_case"));
    expect(migration).toContain("private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])");
    expect(caseAccess).toContain("counselor_assignment.assignment_type = 'counselor'");
    expect(caseAccess).toContain("counselor_assignment.ended_at is null");
    expect(caseAccess).toContain("assigned_team.active");
    expect(caseAccess).toContain("team_member.ended_at is null");
    expect(caseAccess).toContain("array['coach', 'campus_lead', 'counselor']::public.app_role[]");
    expect(caseAccess).not.toContain("assignment_type = 'coach'");
    expect(caseAccess).not.toContain("private.current_user_oversees_campus(counseling_case.campus_id)");
  });

  it("does not let campus oversight expose Couple profiles or Couple groups", () => {
    expect(migration).toContain("and couple_group.group_type = 'couple'");
    expect(migration).toContain("not private.current_user_has_role(array['couple']::public.app_role[])");
    expect(migration).toContain("target_group.group_type <> 'couple'");
    expect(migration).toContain("private.current_user_oversees_campus(target_profile.campus_id)");
  });

  it("provides a narrowly scoped Campus Lead assignment-candidate contract without full-profile fields", () => {
    const candidateFunction = migration.slice(migration.indexOf("create or replace function public.get_campus_lead_assignment_candidates"));
    expect(candidateFunction).toContain("security definer");
    expect(candidateFunction).toContain("set search_path = ''");
    expect(candidateFunction).toContain("private.current_user_has_role(array['campus_lead']::public.app_role[])");
    expect(candidateFunction).toContain("private.current_user_oversees_campus(target_campus_id)");
    expect(candidateFunction).toContain("lead_team.group_type = 'campus_lead_team'");
    expect(candidateFunction).toContain("assignment_eligible");
    expect(candidateFunction).toContain("profile.onboarding_completed_at is not null");
    expect(candidateFunction).toContain("invitation.status = 'pending'");
    expect(candidateFunction).toContain("counselor_assignment.assignment_type = 'counselor'");
    expect(candidateFunction).toContain("revoke all on function public.get_campus_lead_assignment_candidates(uuid) from public, anon, authenticated");
    expect(candidateFunction).toContain("grant execute on function public.get_campus_lead_assignment_candidates(uuid) to authenticated");
    expect(candidateFunction).not.toContain("'email',");
    expect(candidateFunction).not.toContain("'phone',");
    expect(candidateFunction).not.toContain("'photo_path',");
  });
});
