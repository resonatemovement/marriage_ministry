import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261119100000_homework_completion_notification_attempt_lookup.sql", "utf8");

describe("Homework notification webhook attempt lookup migration", () => {
  it("returns an attempt ID only to service-role callers with the matching live lease", () => {
    expect(migration).toContain("create or replace function public.get_homework_completion_notification_attempt_id(");
    expect(migration).toContain("if (auth.jwt() ->> 'role') is distinct from 'service_role' then");
    expect(migration).toContain("attempt.claim_token = target_claim_token");
    expect(migration).toContain("notification.claim_token = target_claim_token");
    expect(migration).toContain("attempt.lease_expires_at > clock_timestamp()");
    expect(migration).toContain("notification.lease_expires_at > clock_timestamp()");
    expect(migration).toContain("revoke all on function public.get_homework_completion_notification_attempt_id(uuid, uuid) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.get_homework_completion_notification_attempt_id(uuid, uuid) to service_role");
    expect(migration).not.toContain("grant select on public.homework_completion_notification_attempts");
  });

  it("correlates signed webhook evidence with one frozen recipient and exact notification/attempt tags", () => {
    expect(migration).toContain("create or replace function public.verify_homework_completion_notification_webhook(");
    expect(migration).toContain("target_provider_recipients text[]");
    expect(migration).toContain("coalesce(cardinality(target_provider_recipients), 0) <> 1");
    expect(migration).toContain("current_attempt.notification_id = target_notification_id");
    expect(migration).toContain("payload.provider_idempotency_key = attempt.provider_idempotency_key");
    expect(migration).toContain("payload_recipient is distinct from lower(btrim(target_provider_recipients[1]))");
    expect(migration).toContain("attempt.provider_message_id is distinct from target_provider_message_id");
    expect(migration).toContain("tag_entries.tag_entry ->> 'value' = attempt.id::text");
    expect(migration).toContain("return 'verified';");
    expect(migration).toContain("revoke all on function public.verify_homework_completion_notification_webhook(uuid, uuid, text, text[]) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.verify_homework_completion_notification_webhook(uuid, uuid, text, text[]) to service_role");
  });
});
