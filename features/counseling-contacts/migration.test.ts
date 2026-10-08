import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261007100000_counseling_contact_drilldowns.sql", "utf8");
const tightenedMigration = readFileSync("supabase/migrations/20261007101000_tighten_couple_contact_counselor.sql", "utf8");

describe("Counseling contact drill-down authorization migration", () => {
  it("uses case-aware security-definer contact projections instead of broad table policies", () => {
    expect(migration).toContain("get_counseling_contact_group");
    expect(migration).toContain("security definer set search_path = ''");
    expect(migration).toContain("private.current_user_can_manage_counseling_case(counseling_case.id)");
    expect(migration).toContain("assignment.assignment_type = 'counselor'");
    expect(migration).toContain("couple_group_id = target_group_id");
    expect(migration).toContain("revoke all on function");
    expect(migration).toContain("grant execute");
    expect(migration).not.toContain("create policy profiles_");
    expect(migration).not.toContain("create policy groups_");
    expect(tightenedMigration).toContain("order by assignment.started_at desc");
    expect(tightenedMigration).toContain("target_group_id = (");
  });
});
