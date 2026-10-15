import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261015160000_completed_couple_homework_history.sql", "utf8");

describe("completed Couple Homework history access", () => {
  it("requires the Couple role, own progress, released case Session, and case access", () => {
    expect(migration).toContain("private.current_user_has_role(array['couple']::public.app_role[])");
    expect(migration).toContain("progress.profile_id = auth.uid()");
    expect(migration).toContain("case_session.homework_assignment_revision_id = revision.id");
    expect(migration).toContain("case_session.status in ('active', 'completed')");
    expect(migration).toContain("private.current_user_can_access_case(case_session.counseling_case_id)");
  });

  it("extends only pinned Homework version and block reads", () => {
    expect(migration).toContain("homework_versions_couple_released_read");
    expect(migration).toContain("homework_version_blocks_couple_released_read");
    expect(migration).not.toContain("grant insert");
    expect(migration).not.toContain("grant update");
    expect(migration).not.toContain("grant delete");
    expect(migration).toContain("revoke all on function private.current_user_can_read_released_couple_homework_version(uuid) from public, anon");
  });
});
