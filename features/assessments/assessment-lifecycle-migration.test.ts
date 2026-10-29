import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261029150000_assessment_lifecycle_and_progression.sql",
  "utf8",
);
const runtime = readFileSync("supabase/tests/assessments_foundation_runtime.sql", "utf8");

describe("assessment lifecycle migration contract", () => {
  it("auto-schedules only published versions and waits for Session activation", () => {
    expect(migration).toContain("create or replace function private.assessment_schedule_default_for_case(");
    expect(migration).toContain("version.status = 'published'");
    expect(migration).toContain("assessment_version_auto_assignment");
    expect(migration).toContain("assessment_case_session_auto_assignment");
    expect(migration).toContain("private.activate_case_assessment_schedule(schedule_row.id, active_case_session_id, actor_id)");
    expect(migration).toContain("on conflict (assessment_schedule_id, profile_id) do nothing");
    expect(migration).toContain("assessment_system_defaults");
    expect(migration).toContain("assessment_counselor_preferences");
    expect(migration).toContain("assessment_case_overrides");
    expect(migration).toContain("selected_source := 'system_default'");
    expect(migration).toContain("selected_source := 'counselor_preference'");
    expect(migration).toContain("selected_source := 'case_override'");
    expect(migration).toContain("having count(distinct preference.session_id) = 1");
  });

  it("retains participant access when a schedule is rescheduled but moves the progression gate", () => {
    expect(migration).toContain("add column progression_case_session_id uuid references public.case_sessions(id)");
    expect(migration).toContain("case_session_id = coalesce(existing_schedule.case_session_id, excluded.case_session_id)");
    expect(migration).toContain("progression_case_session_id = excluded.progression_case_session_id");
    expect(migration).toContain("case_session_id = target_case_session_id,");
    expect(migration).toContain("progression_case_session_id = target_case_session_id,");
  });

  it("gates both forward progression RPCs on each participant's submitted initial attempt", () => {
    expect(migration).toContain("create or replace function private.assessment_initial_requirements_complete(");
    expect(migration).toContain("schedule.progression_case_session_id = target_case_session_id");
    expect(migration).toContain("schedule.required_for_progression");
    expect(migration).toContain("attempt.attempt_number = 1");
    expect(migration).toContain("attempt.status = 'submitted'");
    expect(migration).toContain("complete_case_session_schedule_next_before_assessment_gate");
    expect(migration).toContain("complete_counseling_program_before_assessment_gate");
    expect(migration).toContain("Both partners must submit the required initial Assessment before advancing");
    expect(migration).toContain("Both partners must submit the required initial Assessment before completing the program");
    expect(migration).not.toMatch(/override_confirmation\s+is distinct from\s+'ASSESSMENT_OVERRIDE'/i);
  });

  it("keeps the lifecycle wrappers server-authorized with narrow authenticated grants", () => {
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("revoke all on function public.configure_case_assessment_schedule(uuid, uuid, uuid, uuid)");
    expect(migration).toContain("grant execute on function public.configure_case_assessment_schedule(uuid, uuid, uuid, uuid)\n  to authenticated");
    expect(migration).toContain("revoke all on function public.complete_case_session_schedule_next(uuid, uuid, uuid[], timestamptz, timestamptz, text)");
    expect(migration).toContain("grant execute on function public.complete_case_session_schedule_next(uuid, uuid, uuid[], timestamptz, timestamptz, text)\n  to authenticated");
    expect(migration).toContain("revoke all on function public.complete_counseling_program(uuid, text)");
    expect(migration).toContain("grant execute on function public.complete_counseling_program(uuid, text)\n  to authenticated");
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("includes rollback-only runtime coverage for activation, future scheduling, and progression", () => {
    expect(runtime).toContain("begin;");
    expect(runtime).toContain("rollback;");
    expect(runtime).toContain("First Session activation did not assign both partners");
    expect(runtime).toContain("An unavailable Assessment version blocked Session progression");
    expect(runtime).toContain("Future Counselor preference did not wait for Session activation");
    expect(runtime).toContain("where is_final and status = 'published'");
    expect(runtime).toContain("Unassigned Counselor advanced another Case Session");
    expect(runtime).toContain("Both partners must submit the required initial Assessment before completing the program");
    expect(runtime).toContain("Admin Homework OVERRIDE bypassed the final Assessment gate");
    expect(runtime).toContain("Final Session completion failed after both initial submissions");
  });
});
