import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261029160000_assessment_results_history_and_retake_safety.sql", "utf8");
const runtime = readFileSync("supabase/tests/assessments_foundation_runtime.sql", "utf8");

describe("Assessment results/history and retake migration", () => {
  it("shares only the latest partner score projection after both initial submissions", () => {
    expect(migration).toContain("drop function public.get_partner_assessment_score_history(uuid)");
    expect(migration).toContain("partner_name text");
    expect(migration).toContain("own_initial.attempt_number = 1");
    expect(migration).toContain("partner_initial.attempt_number = 1");
    expect(migration).toContain("then return; end if");
    expect(migration).toContain("private.current_user_has_role(array['couple']::public.app_role[])");
    expect(migration).toContain("own_assignment.profile_id = actor");
    expect(migration).toContain("profile.id = partner_profile_id");
    expect(migration).toContain("order by attempt.attempt_number desc");
    expect(migration).toContain("limit 1");
    expect(migration).not.toContain("assessment_responses");
    expect(migration).toContain("revoke all on function public.get_partner_assessment_score_history(uuid) from public, anon");
    expect(migration).toContain("grant execute on function public.get_partner_assessment_score_history(uuid) to authenticated");
    expect(migration).toContain("security definer set search_path = ''");
  });

  it("serializes retake starts and reuses an unfinished retake without changing initial completion", () => {
    const start = migration.slice(migration.indexOf("create or replace function public.start_assessment_attempt"), migration.indexOf("drop function public.get_partner_assessment_score_history"));
    expect(start).toContain("for update");
    expect(start).toContain("attempt_number = 1 and status = 'submitted'");
    expect(start).toContain("attempt_number > 1 and status = 'in_progress'");
    expect(start).toContain("if attempt_id is not null then return attempt_id");
    expect(start).toContain("coalesce(max(attempt_number), 1) + 1");
  });

  it("exercises gated sharing, current partner score, sequential idempotent retakes, and no progression override", () => {
    expect(runtime.trimEnd()).toMatch(/rollback;$/i);
    expect(runtime).toContain("Partner results were shared before both initial submissions");
    expect(runtime).toContain("partner_name");
    expect(runtime).toContain("Repeated retake starts created duplicate active attempts");
    expect(runtime).toContain("unfinished retake replaced the latest completed result");
    expect(runtime).toContain("Incomplete voluntary retake incorrectly blocked final Session completion");
  });
});
