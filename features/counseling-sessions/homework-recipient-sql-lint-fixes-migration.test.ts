import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261119130000_homework_completion_recipient_sql_lint_fixes.sql",
  "utf8",
);

function definition(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

describe("recipient SQL lint correction migration", () => {
  it("qualifies attempt delivery IDs in expired-lease recovery", () => {
    const claim = definition("claim_due_homework_completion_recipient_deliveries");
    expect(claim).toContain("where attempt.delivery_id = expired.id");
    expect(claim).toContain("where attempt.delivery_id is not null");
    expect(claim).toContain("for update of notification, delivery skip locked");
    expect(claim).toContain("security definer set search_path = ''");
    expect(migration).toContain("grant execute on function public.claim_due_homework_completion_recipient_deliveries(integer) to service_role");
  });

  it("validates the payload's cycle tag against the selected recipient delivery", () => {
    const prepare = definition("prepare_homework_completion_recipient_payload");
    expect(prepare).toContain("tag.value ->> 'value'=delivery.notification_id::text");
    expect(prepare).not.toContain("notification.id");
    expect(prepare).toContain("delivery.id::text");
    expect(prepare).toContain("attempt.id::text");
    expect(prepare).toContain("target_provider_payload ? 'cc' or target_provider_payload ? 'bcc'");
    expect(migration).toContain("grant execute on function public.prepare_homework_completion_recipient_payload(uuid, uuid, uuid, jsonb) to service_role");
  });

  it("uses an unambiguous provider-start timestamp without changing cutoff behavior", () => {
    const authorize = definition("authorize_homework_completion_recipient_delivery");
    expect(authorize).toContain("v_provider_started_at timestamptz := clock_timestamp()");
    expect(authorize).toContain("lease_expires_at > v_provider_started_at");
    expect(authorize).toContain("first_provider_started_at=v_provider_started_at");
    expect(authorize).toContain("v_provider_started_at + interval '23 hours'");
    expect(authorize).not.toMatch(/lease_expires_at\s*>\s*started_at/);
    expect(migration).toContain("grant execute on function public.authorize_homework_completion_recipient_delivery(uuid, uuid, uuid) to service_role");
  });

  it("casts session numbers to the existing integer alert result type", () => {
    const alerts = definition("list_homework_completion_recipient_delivery_alerts");
    expect(alerts).toContain("session.template_sequence_number::integer as session_number");
    expect(alerts).toContain("session.template_sequence_number::integer, null::uuid, null::text");
    expect(alerts).toContain("session_number integer");
    expect(alerts).toContain("private.current_user_has_role(array['admin','super_admin']::public.app_role[])");
    expect(migration).toContain("grant execute on function public.list_homework_completion_recipient_delivery_alerts(integer) to authenticated");
  });
});
