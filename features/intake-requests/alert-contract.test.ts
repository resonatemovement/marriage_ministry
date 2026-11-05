import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261105100000_intake_alert_settings_and_detection.sql", "utf8");
const inviteMigration = readFileSync("supabase/migrations/20260915130300_fix_intake_invite_idempotency_query.sql", "utf8");

describe("Intake alert database contract", () => {
  it("stores all approved defaults and enforces bounded positive whole-hour values", () => {
    expect(migration).toContain("intake_ready_for_review_hours integer not null default 48");
    expect(migration).toContain("intake_under_review_hours integer not null default 72");
    expect(migration).toContain("intake_ready_to_invite_hours integer not null default 168");
    expect(migration).toContain("intake_invited_onboarding_hours integer not null default 168");
    expect(migration).toContain("not between 1 and 720");
  });

  it("allows only Admin/Super Admin to write settings in the SECURITY DEFINER RPC", () => {
    const setter = migration.slice(migration.indexOf("create or replace function public.update_global_intake_alert_settings"), migration.indexOf("create or replace function public.get_intake_request_alerts"));
    expect(setter).toContain("security definer");
    expect(setter).toContain("private.current_user_has_role(array['admin', 'super_admin']");
    expect(setter).toContain("revoke all on function public.update_global_intake_alert_settings");
    expect(setter).toContain("grant execute on function public.update_global_intake_alert_settings");
  });

  it("enforces campus scope inside the alert RPC and keeps missing history fail-closed", () => {
    const detector = migration.slice(migration.indexOf("create or replace function public.get_intake_request_alerts"));
    expect(detector).toContain("private.current_user_has_role(array['admin', 'super_admin', 'campus_lead']");
    expect(detector).toContain("private.current_user_oversees_campus(target_campus_id)");
    expect(detector).toContain("private.current_user_oversees_campus(request.campus_id)");
    expect(detector).toContain("eligible.status_entered_at is not null");
    expect(detector).not.toContain("updated_at");
    expect(detector).toContain("request_status <> 'closed'");
  });

  it("uses elapsed hours and emits no invited alert for fully onboarded partners", () => {
    const detector = migration.slice(migration.indexOf("create or replace function public.get_intake_request_alerts"));
    expect(detector).toContain("statement_timestamp() - request.status_entered_at");
    expect(detector).toContain("profile.onboarding_completed_at is not null");
    expect(detector).toContain("eligible.incomplete_count > 0");
    expect(detector).toContain("eligible.invitation_count = 2");
    expect(detector).toContain("eligible.distinct_invited_emails = 2");
    expect(inviteMigration).toContain("insert into public.intake_request_status_history");
  });
});
