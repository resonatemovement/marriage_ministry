import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261119120000_homework_completion_recipient_deliveries.sql", "utf8");
const foundation = readFileSync("supabase/migrations/20261118100000_homework_completion_notification_foundation.sql", "utf8");

describe("Homework recipient-level delivery migration", () => {
  it("keeps one cycle and uniquely tracks each recipient", () => {
    expect(migration).toContain("homework_completion_delivery_per_recipient unique (notification_id, recipient_profile_id)");
    expect(migration).toContain("homework-completion-cycle/' || new_notification_id::text");
    expect(migration).toContain("for each row execute function private.seed_homework_completion_deliveries()");
    expect(migration).toContain("between 1 and 2");
    expect(migration).toContain("no_eligible_counselor");
    expect(migration).toContain("homework_completion_delivery_profile_is_eligible");
  });

  it("isolates attempts, provider payloads, leases, and retries by delivery", () => {
    expect(migration).toContain("add column delivery_id uuid references public.homework_completion_notification_deliveries");
    expect(migration).toContain("homework_completion_notification_payload_delivery_kind_unique");
    expect(migration).toContain("claim_due_homework_completion_recipient_deliveries");
    expect(migration).toContain("get_homework_completion_recipient_delivery_context");
    expect(migration).toContain("list_homework_completion_recipient_delivery_alerts");
    expect(migration).toContain("prepare_homework_completion_recipient_payload");
    expect(migration).toContain("authorize_homework_completion_recipient_delivery");
    expect(migration).toContain("finish_homework_completion_recipient_attempt");
    expect(migration).toContain("interval '23 hours'");
    expect(migration).toContain("private.homework_completion_notification_retry_delay(attempt.attempt_number)");
    expect(migration).toContain("attempt.delivery_id=delivery.id");
    expect(migration).toContain("unique (notification_id, recipient_profile_id)");
    expect(migration).toContain("attempt_count=case when attempt.is_manual_recovery then attempt_count else attempt_count+1 end");
    expect(migration).toContain("attempt_number=case when attempt.is_manual_recovery then null else delivery.attempt_count+1 end");
    expect(migration).toContain("for update of notification, delivery skip locked");
  });

  it("keeps each Counselor delivery independently eligible and terminal", () => {
    expect(migration).toContain("having count(profile.id) filter (where role_map.profile_id is not null) between 1 and 2");
    expect(migration).toContain("homework_completion_delivery_profile_is_eligible(");
    expect(migration).toContain("private.homework_completion_delivery_is_eligible(delivery.id)");
    expect(migration).toContain("provider_outcome_after_cancellation");
    expect(migration).toContain("worker_lease_expired_after_cancellation");
    expect(migration).toContain("return case when delivery.status='cancelled' or notification.status='cancelled' then 'cancelled' else next_state end");
  });

  it("preserves one cycle while allowing one or two independently keyed recipients", () => {
    expect(foundation).toContain("unique (case_session_id, completion_cycle)");
    expect(migration).toContain("'homework-completion-cycle/' || new_notification_id::text");
    expect(migration).toContain("new.provider_idempotency_key || '/recipient/' || eligible.profile_id::text");
    expect(migration).toContain("no_eligible_counselor");
    expect(migration).toContain("provider_idempotency_key text not null unique");
  });

  it("keeps recipient cancellation, recovery, and webhook reconciliation isolated", () => {
    expect(migration).toContain("recipient_eligibility_lost");
    expect(migration).toContain("request_homework_completion_recipient_recovery");
    expect(migration).toContain("reconcile_homework_completion_recipient_attempt");
    expect(migration).toContain("notification_delivery_id");
    expect(migration).toContain("target_delivery_id uuid");
    expect(migration).toContain("revoke all on function public.verify_homework_completion_notification_webhook(uuid,uuid,text,text[])");
    expect(migration).toContain("Conflicting provider evidence replay");
    expect(migration).toContain("notification.status<>'cancelled'");
  });

  it("keeps private delivery rows inaccessible and disables the old cycle-level worker claim", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.homework_completion_notification_deliveries from public, anon, authenticated, service_role");
    expect(migration).toContain("revoke execute on function public.claim_due_homework_completion_notifications(integer) from service_role");
    expect(migration).toContain("grant execute on function public.claim_due_homework_completion_recipient_deliveries(integer) to service_role");
    expect(migration).not.toContain("grant select on public.homework_completion_notification_deliveries");
  });
});
