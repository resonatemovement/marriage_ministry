import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261007120000_unassign_coach_case_assignment.sql", "utf8");

describe("Coach case unassignment migration", () => {
  it("ends only the current active Coach assignment for the requested case and team", () => {
    expect(migration).toContain("private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])");
    expect(migration).toContain("assignment.counseling_case_id = target_case_id");
    expect(migration).toContain("assignment.assigned_group_id = target_group_id");
    expect(migration).toContain("assignment.assignment_type = 'coach'");
    expect(migration).toContain("assignment.ended_at is null");
    expect(migration).toContain("for update");
    expect(migration).toContain("end_reason = coalesce");
    expect(migration).toContain("'assignment_type', 'coach'");
    expect(migration).not.toContain("assignment_type = 'counselor'");
    expect(migration).toContain("revoke execute on function");
    expect(migration).toContain("grant execute on function");
  });
});
