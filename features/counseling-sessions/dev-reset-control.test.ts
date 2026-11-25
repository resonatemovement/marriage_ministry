import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const control = readFileSync("features/counseling-sessions/dev-reset-control.tsx", "utf8");
const action = readFileSync("features/counseling-sessions/actions.ts", "utf8");
const route = readFileSync("app/workspace/cases/[caseId]/page.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261012160000_dev_reset_counseling_journey.sql", "utf8");
const unassignmentMigration = readFileSync("supabase/migrations/20261012161000_dev_reset_counseling_journey_unassign_homework.sql", "utf8");
const cleanSlateMigration = readFileSync("supabase/migrations/20261012162000_dev_reset_clean_slate_audit_cleanup.sql", "utf8");
const notificationResetMigration = readFileSync("supabase/migrations/20261125172835_dev_reset_homework_completion_notification_cleanup.sql", "utf8");
const sessionDependencyResetMigration = readFileSync("supabase/migrations/20261125174005_dev_reset_session_dependent_records.sql", "utf8");

describe("DEV counseling journey reset", () => {
  it("renders only behind the server-side DEV Super Admin condition and requires exact confirmation", () => {
    expect(route).toContain('identity.roles.includes("super_admin") && isDevCounselingProject()');
    expect(route).toContain("canResetCounselingJourney={canResetCounselingJourney}");
    expect(control).toContain('confirmation !== "RESET"');
    expect(control).toContain('name="confirmation"');
    expect(control).toContain("permanently erases this case’s Session, Meeting, released Material, and Homework lifecycle data");
    expect(control).toContain("Session-linked inbox notices and Homework completion notification history");
    expect(control).toContain("Assessment schedules and results are retained but detached");
    expect(action).toContain('await requireOneOfRoles(["super_admin"], "/workspace")');
    expect(action).toContain('confirmation !== "RESET"');
    expect(action).toContain("if (!isDevCounselingProject())");
    expect(control).toContain('confirmation !== "RESET"');
  });

  it("reports reset success/failure with one safe toast and preserves reset confirmation safeguards", () => {
    expect(control).toContain("showErrorToast(result.error)");
    expect(control).toContain('showSuccessToast("DEV counseling case reset successfully.")');
    expect(control).toContain("disabled={pending || confirmation !== \"RESET\"}");
    expect(control).not.toContain("Journey reset.");
    expect(control).not.toContain("role=\"alert\"");
    expect(control).not.toContain("role=\"status\"");
  });

  it("limits the database capability to DEV-issued Super Admin calls with exact RESET", () => {
    expect(migration).toContain("lctkqjjkhpyootwvttvj");
    expect(migration).toContain("private.current_user_has_role(array['super_admin']::public.app_role[])");
    expect(migration).toContain("auth.jwt() ->> 'iss' is distinct from 'https://lctkqjjkhpyootwvttvj.supabase.co/auth/v1'");
    expect(migration).toContain("reset_confirmation is distinct from 'RESET'");
    expect(migration).toContain("revoke execute on function public.reset_counseling_journey(uuid, text) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.reset_counseling_journey(uuid, text) to authenticated");
  });

  it("removes lifecycle rows and restores matched without rewriting setup or base history", () => {
    expect(migration).toContain("delete from public.case_session_meetings");
    expect(migration).toContain("delete from public.case_session_material_blocks");
    expect(migration).toContain("delete from public.case_sessions");
    expect(migration).toContain("delete from public.homework_answers");
    expect(migration).toContain("delete from public.homework_participant_progress");
    expect(migration).toContain("delete from public.homework_assignment_revisions");
    expect(migration).toContain("delete from public.homework_assignments");
    expect(migration).toContain("delete from public.notification_deliveries");
    expect(migration).toContain("history.id > coalesce(");
    expect(migration).toContain("matched.to_status = 'matched'");
    expect(migration).toContain("set status = 'matched', closed_at = null");
    expect(migration).not.toMatch(/insert\s+into\s+public\.(audit_events|homework_audit_events|case_status_history)/i);
    expect(migration).not.toMatch(/(?:delete|update)\s+public\.(homework_audit_events|case_assignments|assessment_documents|profiles|groups|sessions|session_material_blocks)/i);
    expect(unassignmentMigration).toContain("perform public.reset_counseling_journey_impl(target_case_id, reset_confirmation)");
    expect(unassignmentMigration).toContain("set unassigned_at = now(), unassigned_by = actor");
    expect(unassignmentMigration).toContain("grant execute on function public.reset_counseling_journey(uuid, text) to authenticated");
  });

  it("erases lifecycle audit/history and all case Homework assignments without adding reset history", () => {
    expect(cleanSlateMigration).toContain("delete from public.homework_audit_events event");
    expect(cleanSlateMigration).toContain("delete from public.homework_assignments assignment");
    expect(cleanSlateMigration).toContain("event.homework_assignment_id = assignment.id");
    expect(cleanSlateMigration).toContain("assignment.counseling_case_id = target_case_id");
    expect(cleanSlateMigration).toContain("delete from public.audit_events event");
    expect(cleanSlateMigration).toContain("event.entity_type = 'case_session'");
    expect(cleanSlateMigration).toContain("event.entity_id = any(lifecycle_session_ids)");
    expect(cleanSlateMigration).toContain("reset_case_id = (select assignment.counseling_case_id");
    expect(cleanSlateMigration).toContain("auth.jwt() ->> 'iss' = 'https://lctkqjjkhpyootwvttvj.supabase.co/auth/v1'");
    expect(cleanSlateMigration).toContain("private.current_user_has_role(array['super_admin']::public.app_role[])");
    expect(cleanSlateMigration).not.toMatch(/insert\s+into\s+public\.(audit_events|homework_audit_events|case_status_history)/i);
    expect(cleanSlateMigration).not.toMatch(/(?:delete|update)\s+public\.(case_assignments|assessment_documents|profiles|groups|sessions|session_material_blocks)/i);
    expect(migration).toContain("history.id > coalesce(");
    expect(migration).toContain("matched.to_status = 'matched'");
    expect(migration).toContain("set status = 'matched', closed_at = null");
  });

  it("scopes notification-history deletion to the locked DEV Super Admin reset transaction", () => {
    expect(notificationResetMigration).toContain("private.dev_reset_may_delete_homework_notification");
    expect(notificationResetMigration).toContain("current_setting('app.dev_reset_counseling_case_id', true)");
    expect(notificationResetMigration).toContain("notification.counseling_case_id::text = reset_case_id");
    expect(notificationResetMigration).toContain("auth.uid() is null");
    expect(notificationResetMigration).toContain("https://lctkqjjkhpyootwvttvj.supabase.co/auth/v1");
    expect(notificationResetMigration).toContain("private.current_user_has_role(array['super_admin']::public.app_role[])");
    expect(notificationResetMigration).toContain("revoke all on function private.dev_reset_may_delete_homework_notification(uuid)");
    expect(notificationResetMigration).toContain("from public, anon, authenticated, service_role");
    expect(notificationResetMigration).toContain("where case_row.id = target_case_id\n  for update");
    expect(notificationResetMigration).toContain("reset_confirmation is distinct from 'RESET'");
    expect(notificationResetMigration).toContain("perform set_config('app.dev_reset_counseling_case_id', target_case_id::text, true)");
    expect(notificationResetMigration).toContain("perform set_config('app.dev_reset_counseling_case_id', '', true)");
    expect(notificationResetMigration).toContain("grant execute on function public.reset_counseling_journey(uuid, text) to authenticated");
    expect(notificationResetMigration).not.toMatch(/grant\s+execute\s+on\s+function\s+private\.dev_reset_may_delete_homework_notification/i);
  });

  it("removes recipient history leaves-first and retains the existing reset data boundary", () => {
    const deleteOrder = [
      "delete from public.homework_completion_notification_provider_evidence",
      "delete from public.homework_completion_notification_events",
      "delete from public.homework_completion_notification_payloads",
      "delete from public.homework_completion_notification_attempts",
      "delete from public.homework_completion_notification_deliveries",
      "delete from public.homework_completion_notifications notification",
      "perform public.reset_counseling_journey_impl(target_case_id, reset_confirmation)",
    ].map((fragment) => notificationResetMigration.indexOf(fragment));
    expect(deleteOrder.every((index) => index >= 0)).toBe(true);
    expect(deleteOrder).toEqual([...deleteOrder].sort((left, right) => left - right));
    expect(notificationResetMigration).toContain("notification.counseling_case_id = target_case_id");
    expect(notificationResetMigration).not.toMatch(/(?:delete|update)\s+public\.(case_assignments|assessment_documents|profiles|groups|sessions|session_material_blocks)/i);
    expect(notificationResetMigration).toContain("perform public.reset_counseling_journey_impl(target_case_id, reset_confirmation)");
  });

  it("cleans only selected Session inbox notices and detaches, rather than deletes, assessment history", () => {
    expect(sessionDependencyResetMigration).toContain("notification.case_session_id = any(lifecycle_session_ids)");
    expect(sessionDependencyResetMigration).toContain("schedule.counseling_case_id = target_case_id");
    expect(sessionDependencyResetMigration).toContain("schedule.case_session_id = any(lifecycle_session_ids)");
    expect(sessionDependencyResetMigration).toContain("schedule.progression_case_session_id = any(lifecycle_session_ids)");
    expect(sessionDependencyResetMigration).toContain("set case_session_id = null");
    expect(sessionDependencyResetMigration).toContain("progression_case_session_id = null");
    expect(sessionDependencyResetMigration).not.toMatch(/delete\s+from\s+public\.assessment_(case_schedules|participant_assignments|attempts|responses)/i);
    expect(sessionDependencyResetMigration).not.toMatch(/(?:delete|update)\s+public\.(case_assignments|profiles|groups|assessment_documents)/i);
    expect(sessionDependencyResetMigration).toContain("auth.jwt() ->> 'iss' is distinct from 'https://lctkqjjkhpyootwvttvj.supabase.co/auth/v1'");
    expect(sessionDependencyResetMigration).toContain("reset_confirmation is distinct from 'RESET'");
    const cleanupBeforeSessionDelete = [
      "delete from public.in_app_notifications notification",
      "update public.assessment_case_schedules schedule",
      "perform public.reset_counseling_journey_impl(target_case_id, reset_confirmation)",
    ].map((fragment) => sessionDependencyResetMigration.indexOf(fragment));
    expect(cleanupBeforeSessionDelete.every((index) => index >= 0)).toBe(true);
    expect(cleanupBeforeSessionDelete).toEqual([...cleanupBeforeSessionDelete].sort((left, right) => left - right));
  });
});
