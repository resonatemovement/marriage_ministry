import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261120100000_homework_completion_dev_test_claim.sql", "utf8");
const functionBody = migration.split("as $$")[1]?.split("$$;")[0] ?? "";

describe("targeted DEV Homework claim migration contract", () => {
  it("is a service-role-only forward RPC and does not call the global worker or cleanup", () => {
    expect(migration).toContain("create or replace function public.claim_homework_completion_dev_test_notification(");
    expect(migration).toContain("revoke all on function public.claim_homework_completion_dev_test_notification");
    expect(migration).toContain("to service_role");
    expect(functionBody).toContain("auth.jwt() ->> 'role'");
    expect(functionBody).not.toContain("claim_due_homework_completion_recipient_deliveries");
    expect(functionBody).not.toContain("cancel_homework_completion_notifications");
  });

  it("validates the exact synthetic Couple, Session, cycle, and both recipients before writes", () => {
    const preflightEnd = functionBody.indexOf("-- Only after every identity and recipient predicate passes do we claim rows.");
    expect(preflightEnd).toBeGreaterThan(0);
    const preflight = functionBody.slice(0, preflightEnd);
    expect(preflight).toContain("notification.id = target_notification_id");
    expect(preflight).toContain("notification.case_session_id = target_case_session_id");
    expect(preflight).toContain("counseling_case.couple_group_id = target_couple_group_id");
    expect(preflight).toContain("couple.name = 'DEV Test Couple'");
    expect(preflight).toContain("selected_count <> 2");
    expect(preflight).toContain("private.homework_completion_delivery_is_eligible(delivery.id)");
    expect(preflight).toContain("target_recipient_emails");
    expect(preflight).not.toMatch(/\b(update|insert into)\s+public\./i);
  });

  it("locks and mutates only deliveries belonging to the explicit notification", () => {
    expect(functionBody).toMatch(/from public\.homework_completion_notification_deliveries as delivery\s+where delivery\.notification_id = target_notification_id\s+for update/i);
    expect(functionBody).toMatch(/where delivery\.notification_id = target_notification_id\s+and delivery\.recipient_profile_id = any\(selected_profile_ids\)/i);
    expect(functionBody).toContain("claim_sequence = delivery.claim_sequence + 1");
  });
});
