import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261104100000_counseling_oversight_progress.sql", "utf8");
const identityMigration = readFileSync("supabase/migrations/20261104110000_counseling_oversight_couple_identity.sql", "utf8");

describe("read-only Counseling oversight migration", () => {
  it("returns only Couple identity and progress fields, never private answer content", () => {
    expect(migration).toContain("returns table (");
    for (const field of ["couple_name", "case_status", "session_progress", "next_meeting_at", "homework_status"]) expect(migration).toContain(field);
    expect(migration).not.toMatch(/homework_answers|assessment_responses|assessment_choice_scores|counseling_notes/i);
  });

  it("requires an active Coach/Campus Lead supervisory path or Admin role and active Counselor-of-record assignment", () => {
    expect(migration).toContain("private.current_user_has_role(array['coach']");
    expect(migration).toContain("private.current_user_has_role(array['campus_lead']");
    expect(migration).toContain("private.current_user_has_role(array['admin', 'super_admin']");
    expect(migration).toContain("assignment.assignment_type = 'counselor'");
    expect(migration).toContain("assignment.ended_at is null");
    expect(migration).toContain("supervision.ended_at is null");
    expect(migration).toContain("lead_assignment.ended_at is null");
  });

  it("exposes no table grants and limits both RPCs to authenticated users", () => {
    expect(migration).toContain("revoke all on function public.get_counseling_oversight_progress(uuid) from public, anon");
    expect(migration).toContain("grant execute on function public.get_counseling_oversight_progress(uuid) to authenticated");
    expect(migration).toContain("revoke all on function public.get_oversight_counselor_teams(uuid) from public, anon");
    expect(migration).toContain("grant execute on function public.get_oversight_counselor_teams(uuid) to authenticated");
  });
});

describe("counseling oversight Couple identity migration", () => {
  it("exposes only the minimum partner identity under an exact active Case/team assignment", () => {
    expect(identityMigration).toContain("get_counseling_oversight_couple_identity(");
    expect(identityMigration).toContain("target_team_id uuid");
    expect(identityMigration).toContain("target_case_id uuid");
    expect(identityMigration).toContain("assignment.assignment_type = 'counselor'");
    expect(identityMigration).toContain("assignment.ended_at is null");
    expect(identityMigration).toContain("assignment.assigned_group_id = target_team_id");
    expect(identityMigration).toContain("team.active");
    expect(identityMigration).toContain("supervision.ended_at is null");
    expect(identityMigration).toContain("assignment.ended_at is null");
    expect(identityMigration).not.toMatch(/homework_answer|assessment_response|counseling_note|email|phone/i);
  });

  it("keeps the RPC read-only, hardened, and unavailable to anon/public", () => {
    expect(identityMigration).toContain("language sql\nstable\nsecurity definer\nset search_path = ''");
    expect(identityMigration).toContain("revoke all on function public.get_counseling_oversight_couple_identity(uuid, uuid) from public, anon");
    expect(identityMigration).toContain("grant execute on function public.get_counseling_oversight_couple_identity(uuid, uuid) to authenticated");
    expect(identityMigration).not.toMatch(/\b(insert|update|delete|truncate)\s+into?\b/i);
  });
});
