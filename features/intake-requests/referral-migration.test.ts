import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261109140000_intake_referral_actions_and_alerts.sql", "utf8");
const dashboardMigration = readFileSync("supabase/migrations/20261109150000_dashboard_intake_referral_count.sql", "utf8");

describe("Intake referral database contracts", () => {
  it("validates referral reason and records actor, time, reason, and audit event in existing structures", () => {
    expect(migration).toContain("char_length(normalized_detail) not between 10 and 500");
    expect(migration).toContain("next_status := 'referred_elsewhere'");
    expect(migration).toContain("changed_by");
    expect(migration).toContain("action_note := normalized_detail");
    expect(migration).toContain("'referral_reason'");
    expect(migration).not.toMatch(/create\s+table/i);
    expect(migration).not.toContain("referral_destination");
  });

  it("allows only campus-authorized managers and reopens referred requests into review", () => {
    expect(migration).toContain("private.current_user_can_manage_intake(target_request_id)");
    expect(migration).toContain("current_request.status in ('ready_for_review', 'under_review')");
    expect(migration).toContain("current_request.status in ('closed', 'referred_elsewhere')");
    expect(migration).toContain("next_status := 'under_review'");
    expect(migration).toContain("when 'referred_elsewhere' then false");
  });

  it("keeps Intake referrals as a separate campus-scoped, identity-free Dashboard aggregate", () => {
    expect(dashboardMigration).toContain("get_dashboard_intake_referral_count()");
    expect(dashboardMigration).toContain("private.current_user_oversees_campus(request.campus_id)");
    expect(dashboardMigration).toContain("request.status = 'referred_elsewhere'");
    expect(dashboardMigration).toContain("stable");
    expect(dashboardMigration).toContain("security definer");
    expect(dashboardMigration).toContain("set search_path = ''");
    expect(dashboardMigration).toContain("revoke all on function public.get_dashboard_intake_referral_count() from public, anon, authenticated");
    expect(dashboardMigration).toContain("grant execute on function public.get_dashboard_intake_referral_count() to authenticated");
  });
});
