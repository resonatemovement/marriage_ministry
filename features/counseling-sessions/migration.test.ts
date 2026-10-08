import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261002100000_counseling_sessions_workspace.sql", "utf8");
const policyFix = readFileSync("supabase/migrations/20261002110000_fix_counseling_sessions_progress_policy.sql", "utf8");
const recursionFix = readFileSync("supabase/migrations/20261002120000_fix_homework_read_policy_recursion.sql", "utf8");
const coupleIdentity = readFileSync("supabase/migrations/20261007110000_counseling_workspace_couple_identity.sql", "utf8");
const coupleNamePrecedence = readFileSync("supabase/migrations/20261007130000_couple_custom_name_precedence.sql", "utf8");
const statusHistoryCorrection = readFileSync("supabase/migrations/20261008100000_fix_counseling_case_status_history.sql", "utf8");

describe("counseling Sessions migration", () => {
  it("keeps meeting lifecycle and progression in narrow RPCs", () => {
    expect(migration).toContain("create table public.case_session_meetings");
    expect(migration).toContain("create or replace function public.schedule_case_session_meeting");
    expect(migration).toContain("Complete the current Session Homework");
    expect(migration).toContain("create or replace function public.close_counseling_case");
    expect(migration).toContain("case_session_meetings_read_authorized");
  });

  it("records only real transitions to active using the case status captured before scheduling", () => {
    const functionBody = statusHistoryCorrection.slice(statusHistoryCorrection.indexOf("create or replace function public.schedule_case_session_meeting"));
    expect(functionBody).toContain("select status into prior_status from public.counseling_cases where id = target_case_id and closed_at is null for update");
    expect(functionBody.indexOf("select status into prior_status")).toBeLessThan(functionBody.indexOf("update public.counseling_cases set status"));
    expect(functionBody).toContain("if prior_status in ('requested', 'assessment', 'interviewed', 'matched') then");
    expect(functionBody).toContain("values (target_case_id, prior_status, 'active', actor, 'Session meeting scheduled')");
    expect(functionBody).not.toContain("select id, status, 'active', actor, 'Session meeting scheduled' from public.counseling_cases");
  });

  it("preserves meeting updates, initial scheduling, sequence checks, homework activation, and the existing history reason", () => {
    expect(statusHistoryCorrection).toContain("where counseling_case_id = target_case_id and session_id is not distinct from target_session_id for update");
    expect(statusHistoryCorrection).toContain("if target_session_id is null then");
    expect(statusHistoryCorrection).toContain("Complete the current Session Homework before scheduling the next meeting");
    expect(statusHistoryCorrection).toContain("Meetings must be scheduled in Session order");
    expect(statusHistoryCorrection).toContain("perform private.activate_case_session_homework(target_case_id, target_session_id, actor)");
    expect(statusHistoryCorrection).toContain("Session meeting scheduled");
    expect(statusHistoryCorrection).not.toContain("close_counseling_case");
  });

  it("keeps care-team Homework progress access out of the revisions/progress RLS cycle", () => {
    expect(policyFix).toContain("current_user_can_manage_homework_assignment_revision");
    expect(policyFix).toContain("drop policy homework_progress_care_team_read");
    expect(policyFix).toContain("homework_progress_care_team_read");
  });

  it("keeps existing participant Homework reads out of the same RLS cycle", () => {
    expect(recursionFix).toContain("current_user_can_read_homework_assignment");
    expect(recursionFix).toContain("current_user_can_read_homework_assignment_revision");
    expect(recursionFix).toContain("drop policy homework_assignment_admin_read");
    expect(recursionFix).toContain("drop policy homework_revision_admin_read");
  });

  it("projects only active Couple names/photos for cases the caller can access", () => {
    expect(coupleIdentity).toContain("create or replace function public.get_counseling_workspace_couple_identity(target_case_id uuid)");
    expect(coupleIdentity).toContain("counseling_case.id = target_case_id");
    expect(coupleIdentity).toContain("private.current_user_can_access_case(counseling_case.id)");
    expect(coupleIdentity).toContain("membership.ended_at is null");
    expect(coupleIdentity).toContain("profile.first_name");
    expect(coupleIdentity).toContain("profile.last_name");
    expect(coupleIdentity).toContain("profile.photo_path");
    expect(coupleIdentity).not.toContain("profile.email");
    expect(coupleIdentity).not.toContain("profile.phone");
    expect(coupleIdentity).toContain("revoke all on function public.get_counseling_workspace_couple_identity(uuid) from public, anon, authenticated");
    expect(coupleIdentity).toContain("grant execute on function public.get_counseling_workspace_couple_identity(uuid) to authenticated");
  });

  it("adds only the Couple group display name to the existing case-scoped identity projection", () => {
    expect(coupleNamePrecedence).toContain("drop function public.get_counseling_workspace_couple_identity(uuid)");
    expect(coupleNamePrecedence).toContain("couple_group.name");
    expect(coupleNamePrecedence).toContain("private.current_user_can_access_case(counseling_case.id)");
    expect(coupleNamePrecedence).toContain("membership.ended_at is null");
    expect(coupleNamePrecedence).toContain("revoke all on function public.get_counseling_workspace_couple_identity(uuid) from public, anon, authenticated");
    expect(coupleNamePrecedence).toContain("grant execute on function public.get_counseling_workspace_couple_identity(uuid) to authenticated");
    expect(coupleNamePrecedence).not.toMatch(/create\s+policy|alter\s+table|grant\s+select/i);
  });
});
