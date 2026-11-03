import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261103100000_allow_staff_assessment_result_reads.sql", "utf8");
const foundation = readFileSync("supabase/migrations/20261029130000_assessments_database_foundation.sql", "utf8");

describe("staff Assessment result access migration", () => {
  it("uses existing Case authorization for staff result reads without granting schedule management", () => {
    expect(migration).toContain("create or replace function private.assessment_can_read_staff_results(target_case_id uuid)");
    expect(migration).toContain("private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])");
    expect(migration).toContain("private.current_user_can_manage_counseling_case(counseling_case.id)");
    expect(migration).toContain("closed_at is null");
    expect(migration).toContain("private.assessment_can_read_staff_results(target_case_id)");
    expect(migration).not.toContain("create or replace function private.assessment_can_manage_case");
    expect(migration).not.toContain("configure_case_assessment_schedule");
    expect(migration).not.toContain("reschedule_case_assessment_schedule");
  });

  it("limits staff reads to assignment, attempt, score, and category results", () => {
    expect(migration).toContain("assessment_participant_assignments_owner_or_authorized_staff_read");
    expect(migration).toContain("assessment_attempts_owner_or_authorized_staff_read");
    expect(migration).toContain("assessment_attempt_scores_owner_or_authorized_staff_read");
    expect(migration).toContain("private.assessment_can_read_staff_results(schedule.counseling_case_id)");
    expect(migration).not.toMatch(/drop policy .*assessment_responses/i);
    expect(migration).not.toMatch(/create policy .*assessment_responses/i);
    expect(foundation).toContain("create policy assessment_responses_owner_read on public.assessment_responses for select to authenticated\nusing (profile_id = auth.uid())");
    expect(migration).not.toContain("assessment_questions");
    expect(migration).not.toContain("assessment_choices");
  });
});
