import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const query = readFileSync("features/assessments/couple-queries.ts", "utf8");
const actions = readFileSync("features/assessments/couple-actions.ts", "utf8");
const route = readFileSync("app/workspace/assessments/[assignmentId]/page.tsx", "utf8");
const rls = readFileSync("supabase/migrations/20261029130000_assessments_database_foundation.sql", "utf8");

describe("Couple Assessment access contract", () => {
  it("scopes assignments, attempts, and answers to the authenticated profile and never loads partner history", () => {
    expect(query).toContain('.eq("profile_id", profileId)');
    expect(query).toContain('.eq("attempt_id", attempt.id).eq("profile_id", profileId)');
    expect(query).not.toContain("get_partner_assessment_score_history");
    expect(query).not.toContain("service_role");
  });

  it("keeps routes Couple-role gated and writes only through the existing authorized RPCs", () => {
    expect(route).toContain('identity.roles.includes("couple")');
    expect(actions).toContain('"start_assessment_attempt"');
    expect(actions).toContain('"save_assessment_response"');
    expect(actions).toContain('"submit_assessment_attempt"');
    expect(actions).not.toContain("service_role");
    expect(actions).not.toContain("from(\"assessment_responses\").insert");
  });

  it("relies on existing database RLS for owner-only participant answers and submitted immutability", () => {
    expect(rls).toContain("create policy assessment_responses_owner_read");
    expect(rls).toContain("using (profile_id = auth.uid())");
    expect(rls).toContain("Submitted Assessment responses are read-only");
    expect(rls).toContain("on conflict (attempt_id, question_id) do update");
  });
});
