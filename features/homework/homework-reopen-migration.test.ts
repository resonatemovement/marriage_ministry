import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261028100000_homework_reopen_and_in_app_notifications.sql"), "utf8");
const realtimeMigration = readFileSync(join(process.cwd(), "supabase/migrations/20261028110000_publish_in_app_notifications_realtime.sql"), "utf8");

describe("Homework reopen and in-app notification migration", () => {
  it("limits notification visibility and writes to recipient-authorized contracts", () => {
    expect(migration).toContain("create table public.in_app_notifications");
    expect(migration).toContain("notification_type = 'homework_reopened'");
    expect(migration).toContain("revoke all on public.in_app_notifications from public, anon, authenticated");
    expect(migration).toContain("grant select on public.in_app_notifications to authenticated");
    expect(migration).toContain("using (recipient_profile_id = (select auth.uid()))");
    expect(migration).not.toMatch(/grant\s+(?:insert|update|all)\s+on\s+public\.in_app_notifications\s+to\s+authenticated/i);
    expect(migration).toContain("recipient_profile_id = auth.uid()");
  });

  it("restricts reopening to Admins or an assigned Counselor-role member of a Counselor team", () => {
    expect(migration).toContain("private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])");
    expect(migration).toContain("private.current_user_has_role(array['counselor']::public.app_role[])");
    expect(migration).toContain("counselor_team.group_type = 'counselor_team'");
    expect(migration).toContain("assignment.assignment_type = 'counselor'");
    expect(migration).toContain("couple_membership.ended_at is null");
    expect(migration).toContain("case_session.status = 'active'");
    expect(migration).toContain("counseling_case.status = 'active'");
  });

  it("atomically preserves answer rows, updates only the selected progress, and appends audit plus one notification", () => {
    const rpc = migration.slice(migration.indexOf("create or replace function public.reopen_participant_homework"), migration.indexOf("create or replace function public.mark_in_app_notification_read"));
    expect(rpc).toContain("for update of counseling_case, case_session, assignment, revision, progress");
    expect(rpc).toContain("homework_row.status not in ('submitted', 'reviewed')");
    expect(rpc).toContain("set status = 'in_progress', submitted_at = null, reviewed_at = null");
    expect(rpc).not.toContain("homework_answers");
    expect(rpc).toContain("insert into public.homework_audit_events");
    expect(rpc).toContain("'homework_reopened'");
    expect(rpc).toContain("insert into public.in_app_notifications");
    expect(rpc).toContain("return homework_row.case_session_id");
  });

  it("allows only the recipient to mark a notification read", () => {
    const rpc = realtimeMigration.slice(realtimeMigration.indexOf("create or replace function public.mark_in_app_notification_read"), realtimeMigration.indexOf("do $$"));
    expect(rpc).toContain("where id = target_notification_id");
    expect(rpc).toContain("and recipient_profile_id = auth.uid()");
    expect(rpc).toContain("set read_at = coalesce(read_at, now())");
    expect(rpc).toContain("grant execute on function public.mark_in_app_notification_read(uuid) to authenticated");
  });

  it("publishes only recipient-RLS-protected notification inserts for authenticated refresh", () => {
    expect(realtimeMigration).toContain("alter publication supabase_realtime add table public.in_app_notifications");
    expect(realtimeMigration).toContain("tablename = 'in_app_notifications'");
    expect(migration).toContain("create policy in_app_notifications_recipient_read");
  });
});
