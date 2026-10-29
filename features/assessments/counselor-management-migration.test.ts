import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261029170000_assessment_counselor_management.sql", "utf8");
const reschedulingMigration = readFileSync("supabase/migrations/20261029180000_reschedule_assessment_without_repinning.sql", "utf8");

describe("Counselor Assessment management RPC migration", () => {
  it("limits catalog results to authorized Case managers and exposes catalog metadata only", () => {
    expect(migration).toContain("private.assessment_can_manage_case(target_case_id)");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("version.status = 'published'");
    expect(migration).toContain("order by version.version_number desc");
    expect(migration).not.toMatch(/assessment_questions|assessment_choices|assessment_choice_scores|assessment_responses|assessment_attempt_scores/);
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to authenticated");
  });

  it("reschedules without changing the pinned version or removing participant history", () => {
    expect(reschedulingMigration).toContain("private.assessment_can_manage_case(target_case_id)");
    expect(reschedulingMigration).toContain("for update");
    expect(reschedulingMigration).toContain("progression_case_session_id = active_case_session_id");
    expect(reschedulingMigration).toContain("private.activate_case_assessment_schedule(schedule_id, active_case_session_id, actor)");
    expect(reschedulingMigration).not.toMatch(/assessment_version_id\s*=|delete from public\.assessment_(participant_assignments|attempts|responses|attempt_scores)/i);
    expect(reschedulingMigration).toContain("from public, anon, authenticated");
    expect(reschedulingMigration).toContain("to authenticated");
  });
});
