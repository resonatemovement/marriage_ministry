import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261120110000_homework_completion_dev_test_identity.sql", "utf8");
const functionBody = migration.split("as $$")[1]?.split("$$;")[0] ?? "";

describe("targeted DEV notification identity migration", () => {
  it("keeps the exact target IDs and recipient allowlist as pre-write gates", () => {
    expect(functionBody).toContain("notification.id = target_notification_id");
    expect(functionBody).toContain("notification.case_session_id = target_case_session_id");
    expect(functionBody).toContain("counseling_case.couple_group_id = target_couple_group_id");
    expect(functionBody).toContain("selected_emails is distinct from");
    expect(functionBody).toContain("private.homework_completion_delivery_is_eligible(delivery.id)");
    expect(functionBody).not.toContain("couple.name =");
    expect(functionBody.slice(0, functionBody.indexOf("for claimed_delivery in"))).not.toMatch(/\b(update|insert into)\s+public\./i);
  });

  it("preserves the service-role-only RPC signature and target-scoped writes", () => {
    expect(migration).toContain("returns table(\n  notification_id uuid,\n  delivery_id uuid,\n  claim_token uuid,\n  manual_recovery boolean\n)");
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(functionBody).toMatch(/where delivery\.notification_id = target_notification_id\s+and delivery\.recipient_profile_id = any\(selected_profile_ids\)/i);
  });
});
