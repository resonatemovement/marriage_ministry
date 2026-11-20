import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261120120000_homework_completion_dev_scoped_claim.sql", "utf8");
const body = migration.split("as $$")[1]?.split("$$;")[0] ?? "";
const lintFixMigration = readFileSync("supabase/migrations/20261120130000_homework_completion_dev_scoped_claim_lint_fix.sql", "utf8");
const lintFixBody = lintFixMigration.split("as $$")[1]?.split("$$;")[0] ?? "";

describe("DEV-scoped Homework notification claim RPC", () => {
  it("hard-limits every cleanup, expiry, and claim path to the approved Couple and Counselor identities", () => {
    expect(body).toContain("approved_couple_group_id constant uuid := '23f1ac05-7090-4081-bf42-78f92a8da5d1'");
    expect(body).toContain("'8e5aacb2-c645-4922-892d-50a4ee65d464'::uuid");
    expect(body).toContain("'b7bf9f7b-45f8-4780-9243-b0a1d22ef095'::uuid");
    expect(body.match(/couple_group_id = approved_couple_group_id/g)).toHaveLength(4);
    expect(body.match(/recipient_profile_id = any\(approved_recipient_profile_ids\)/g)).toHaveLength(3);
    expect(body).toContain("private.cancel_homework_completion_notifications(");
    expect(body).not.toContain("private.cancel_homework_completion_notifications(null, null, null)");
  });

  it("checks the exact active Counselor email identities before any database mutation", () => {
    const mutation = body.search(/\b(update|insert into)\s+public\./i);
    expect(mutation).toBeGreaterThan(0);
    expect(body.slice(0, mutation)).toContain("actual_recipient_emails is distinct from configured_recipient_emails");
    expect(body.slice(0, mutation)).toContain("profile.status = 'active'");
    expect(body.slice(0, mutation)).toContain("@mailinator\\.com");
  });

  it("preserves service-role-only access and bounded claim semantics", () => {
    expect(migration).toContain("security definer set search_path = ''");
    expect(body).toContain("auth.jwt() ->> 'role'");
    expect(body).toContain("claim_limit not between 1 and 25");
    expect(body).toContain("for update of notification, delivery skip locked");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("qualifies the PL/pgSQL output-name collisions and casts the approved Couple UUID", () => {
    expect(lintFixBody).toContain("'23f1ac05-7090-4081-bf42-78f92a8da5d1'::uuid");
    expect(lintFixBody).toContain("where attempt.delivery_id = expired.id");
    expect(lintFixBody).toContain("attempt.claim_token = expired.claim_token");
    expect(lintFixBody).not.toMatch(/where delivery_id\s*=/i);
    expect(lintFixMigration).toContain("grant execute on function public.claim_due_homework_completion_dev_recipient_deliveries(integer, text[]) to service_role");
  });
});
