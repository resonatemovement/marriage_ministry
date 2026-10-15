import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const control = readFileSync("features/counseling-sessions/dev-reset-control.tsx", "utf8");
const action = readFileSync("features/counseling-sessions/actions.ts", "utf8");
const route = readFileSync("app/workspace/cases/[caseId]/page.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261012160000_dev_reset_counseling_journey.sql", "utf8");
const unassignmentMigration = readFileSync("supabase/migrations/20261012161000_dev_reset_counseling_journey_unassign_homework.sql", "utf8");
const cleanSlateMigration = readFileSync("supabase/migrations/20261012162000_dev_reset_clean_slate_audit_cleanup.sql", "utf8");

describe("DEV counseling journey reset", () => {
  it("renders only behind the server-side DEV Super Admin condition and requires exact confirmation", () => {
    expect(route).toContain('identity.roles.includes("super_admin") && isDevCounselingProject()');
    expect(route).toContain("canResetCounselingJourney={canResetCounselingJourney}");
    expect(control).toContain('confirmation !== "RESET"');
    expect(control).toContain('name="confirmation"');
    expect(control).toContain("permanently erases this case’s Session, Meeting, released Material, and Homework lifecycle data");
    expect(action).toContain('await requireOneOfRoles(["super_admin"], "/workspace")');
    expect(action).toContain('confirmation !== "RESET"');
    expect(action).toContain("if (!isDevCounselingProject())");
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
});
