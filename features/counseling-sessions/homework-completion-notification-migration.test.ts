import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261118100000_homework_completion_notification_foundation.sql",
  "utf8",
);
const pairedResponsePersistence = readFileSync(
  "supabase/migrations/20261116120000_homework_paired_response_rows.sql",
  "utf8",
);

describe("Homework completion notification database foundation", () => {
  it("stores one immutable cycle identity and append-only state history", () => {
    expect(migration).toContain("unique (case_session_id, completion_cycle)");
    expect(migration).toContain("provider_idempotency_key text not null unique");
    expect(migration).toContain("guard_homework_completion_notification_identity");
    expect(migration).toContain("prevent_homework_completion_notification_event_mutation");
    expect(migration).toContain("Homework completion notification history is append-only");
    expect(migration).toContain("'pending', 'claimed', 'sent', 'delivered', 'failed', 'blocked', 'skipped', 'cancelled', 'uncertain'");
  });

  it("enqueues only after an authorized submission transitions to submitted", () => {
    expect(migration).toContain("alter function public.persist_participant_homework(uuid, jsonb, text)");
    expect(migration).toContain("private.persist_participant_homework_with_paired_validation(");
    expect(migration).toContain("for update of session");
    expect(migration).toContain("alter function public.persist_participant_homework(uuid, jsonb, text)");
    expect(pairedResponsePersistence).toContain("for update of assignment, progress");
    expect(migration).toContain("for update of session");
    expect(migration).toContain("target_intent = 'submit'");
    expect(migration).toContain("prior_status not in ('submitted', 'reviewed')");
    expect(migration).toContain("final_status = 'submitted'");
    expect(migration).toContain("perform private.enqueue_homework_completion_notification(target_progress_id)");
    expect(migration).toContain("progress.status in ('submitted', 'reviewed')");
  });

  it("serializes completion cycles and snapshots exactly one eligible current Counselor-of-record", () => {
    expect(migration).toContain("select coalesce(max(notification.completion_cycle), 0) + 1");
    expect(migration).toContain("eligible_assignment_count <> 1");
    expect(migration).toContain("assignment.assignment_type = 'counselor'");
    expect(migration).toContain("assignment.ended_at is null");
    expect(migration).toContain("profile.status = 'active'");
    expect(migration).toContain("having count(*) = 2");
    expect(migration).toContain("no_eligible_counselor");
    expect(migration).toContain("'homework-completion-cycle/' || new_notification_id::text");
  });

  it("cancels queued work on reopen, reassignment, recipient loss, or Homework lifecycle changes", () => {
    expect(migration).toContain("alter function public.reopen_participant_homework(uuid, uuid) set schema private");
    expect(migration).toContain("status_code = 'homework_reopened'");
    expect(migration).toContain("cancel_homework_notifications_after_assignment_change");
    expect(migration).toContain("cancel_homework_notifications_after_membership_change");
    expect(migration).toContain("cancel_homework_notifications_after_profile_role_change");
    expect(migration).toContain("cancel_homework_notifications_after_profile_status_change");
    expect(migration).toContain("cancel_homework_notifications_after_homework_unassign");
    expect(migration).toContain("cancel_homework_notifications_after_revision_end");
  });

  it("provides leased service-role claims, idempotent retry state, and one audited Admin recovery", () => {
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("interval '15 minutes'");
    expect(migration).toContain("interval '5 minutes'");
    expect(migration).toContain("interval '15 minutes'");
    expect(migration).toContain("interval '1 hour'");
    expect(migration).toContain("interval '6 hours'");
    expect(migration).toContain("'worker_lease_expired'");
    expect(migration).toContain("'accepted', 'delivered', 'rejected_retryable', 'rejected_permanent', 'uncertain', 'bounced'");
    expect(migration).toContain("not private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])");
    expect(migration).toContain("notification.manual_recovery_used_at is not null");
    expect(migration).toContain("'single_audited_recovery'");
    expect(migration).toContain("grant execute on function public.claim_due_homework_completion_notifications(integer) to service_role");
  });

  it("requires confirmed non-acceptance and reserves recovery without consuming it", () => {
    const recovery = migration.slice(
      migration.indexOf("create or replace function public.request_homework_completion_notification_recovery"),
    );
    const start = migration.slice(
      migration.indexOf("-- This is the durable provider-start boundary."),
      migration.indexOf("revoke all on function public.authorize_homework_completion_notification_delivery"),
    );
    expect(recovery).toContain("notification.status <> 'failed'");
    expect(recovery).toContain("attempt.status not in ('rejected_retryable', 'rejected_permanent')");
    expect(recovery).toContain("manual_recovery_reserved_at = clock_timestamp()");
    expect(recovery).toContain("manual_recovery_idempotency_key = notification.provider_idempotency_key || '/manual-recovery/1'");
    expect(recovery).not.toContain("manual_recovery_used_at = clock_timestamp()");
    expect(start).toContain("manual_recovery_used_at = case when attempt.is_manual_recovery then clock_timestamp()");
    expect(start).toContain("status = 'started'");
    expect(migration).toContain("homework_completion_recipient_snapshot_is_eligible(");
  });

  it("rejects expired claims and preserves late provider outcomes without reopening canceled work", () => {
    const finish = migration.slice(
      migration.indexOf("create or replace function public.finish_homework_completion_notification_attempt"),
      migration.indexOf("-- This is an outcome-only path"),
    );
    const reconcile = migration.slice(
      migration.indexOf("create or replace function public.reconcile_homework_completion_notification_attempt"),
      migration.indexOf("revoke all on function public.reconcile_homework_completion_notification_attempt"),
    );
    expect(finish).toContain("lease_expires_at > clock_timestamp()");
    expect(finish).toContain("status = 'started'");
    expect(finish).toContain("if not found then raise exception 'Worker lease expired before outcome finalization'");
    expect(reconcile).toContain("'accepted', 'delivered', 'rejected_retryable', 'rejected_permanent', 'uncertain', 'bounced'");
    expect(reconcile).toContain("Provider evidence identifier is required");
    expect(reconcile).toContain("if notification.status = 'cancelled' then");
    expect(reconcile).not.toContain("grant execute");
    expect(migration).toContain("grant execute on function public.reconcile_homework_completion_notification_attempt(uuid, text, text, text, text) to service_role");
    expect(migration).toContain("cancellation_requested_at = case when attempt.started_at is not null");
    expect(migration).toContain("status = 'expired_before_start'");
  });

  it("reserves a single recovery only after confirmed non-acceptance", () => {
    const recovery = migration.slice(
      migration.indexOf("create or replace function public.request_homework_completion_notification_recovery"),
    );
    expect(recovery).toContain("where id = target_notification_id for update");
    expect(recovery).toContain("notification.status <> 'failed'");
    expect(recovery).toContain("attempt.status not in ('rejected_retryable', 'rejected_permanent')");
    expect(recovery).toContain("attempt.attempt_number is not null");
    expect(recovery).toContain("attempt.status not in ('rejected_before_start', 'expired_before_start', 'cancelled_before_start')");
    expect(recovery).toContain("manual_recovery_reserved_at is not null");
    expect(recovery).toContain("manual_recovery_used_at is not null");
    expect(recovery).toContain("manual_recovery_recipient_assignment_id = recovered_assignment_id");
    expect(recovery).toContain("manual_recovery_recipient_group_id = recovered_group_id");
    expect(recovery).toContain("manual_recovery_recipient_profile_ids = recovered_profile_ids");
    expect(migration).toContain("unique index homework_completion_notification_manual_key_unique");
    expect(recovery).not.toContain("uncertain");
    expect(recovery).not.toContain("accepted");
    expect(recovery).not.toContain("delivered");
    expect(recovery).not.toContain("bounced");
  });

  it("freezes the complete provider request before start and reuses it under the same key", () => {
    const payload = migration.slice(
      migration.indexOf("create or replace function public.prepare_homework_completion_notification_payload"),
      migration.indexOf("revoke all on function public.prepare_homework_completion_notification_payload"),
    );
    const start = migration.slice(
      migration.indexOf("create or replace function public.authorize_homework_completion_notification_delivery"),
      migration.indexOf("revoke all on function public.authorize_homework_completion_notification_delivery"),
    );

    expect(migration).toContain("create table public.homework_completion_notification_payloads");
    expect(migration).toContain("provider_payload jsonb not null");
    expect(migration).toContain("idempotency_cutoff_at timestamptz,");
    expect(migration).toContain("homework_completion_notification_payload_kind_unique unique (notification_id, payload_kind)");
    expect(migration).toContain("prevent_homework_completion_notification_payload_mutation");
    expect(migration).toContain("revoke all on public.homework_completion_notification_payloads from public, anon, authenticated, service_role");
    expect(payload).toContain("for update");
    expect(payload).toContain("frozen.provider_payload");
    expect(migration).toContain("first_provider_started_at timestamptz");
    expect(payload).toContain("first_provider_started_at");
    expect(payload).not.toContain("clock_timestamp() + interval '23 hours'");
    expect(migration).toContain("idempotency_cutoff_at = provider_started_at + interval '23 hours'");
    expect(migration).toContain("new.idempotency_cutoff_at is distinct from new.first_provider_started_at + interval '23 hours'");
    expect(payload).toContain("target_provider_payload -> 'to' is distinct from expected_to");
    expect(payload).toContain("raise exception 'recipient_email_missing'");
    expect(payload).toContain("raise exception 'recipient_email_invalid'");
    expect(payload).toContain("homework_completion_payload_has_answer_fields");
    expect(start).toContain("payload.notification_id = notification.id");
    expect(start).toContain("frozen.idempotency_cutoff_at <= provider_started_at");
    expect(start).toContain("notification.attempt_count > 0");
    expect(start).toContain("frozen.first_provider_started_at is null");
    expect(start).toContain("provider_idempotency_cutoff_missing");
    expect(start).toContain("frozen.first_provider_started_at is null");
    expect(start).toContain("'providerPayload', frozen.provider_payload");
    expect(start).toContain("'idempotencyCutoffAt', frozen.idempotency_cutoff_at");
    expect(start).toContain("provider_idempotency_window_expired");
  });

  it("records pre-delivery recipient failures without consuming a provider attempt", () => {
    const fail = migration.slice(
      migration.indexOf("create or replace function public.fail_homework_completion_notification_before_delivery"),
      migration.indexOf("revoke all on function public.fail_homework_completion_notification_before_delivery"),
    );
    const recovery = migration.slice(
      migration.indexOf("create or replace function public.request_homework_completion_notification_recovery"),
    );

    expect(migration).toContain("'rejected_before_start'");
    expect(fail).toContain("failure_code not in ('recipient_email_missing', 'recipient_email_invalid')");
    expect(fail).toContain("attempt_number is null");
    expect(fail).toContain("attempt.started_at is not null");
    expect(fail).toContain("status = 'failed'");
    expect(fail).not.toContain("attempt_count = attempt_count + 1");
    expect(fail).toContain("lease_expires_at > clock_timestamp()");
    expect(recovery).toContain("attempt.status = 'rejected_before_start'");
    expect(recovery).toContain("notification.attempt_count = 0");
    expect(recovery).toContain("recipient_email_missing");
    expect(recovery).toContain("profile.email is not null");
  });

  it("makes provider evidence replay idempotent, rejects conflicts, and allows only forward progression", () => {
    const reconcile = migration.slice(
      migration.indexOf("create or replace function public.reconcile_homework_completion_notification_attempt"),
      migration.indexOf("revoke all on function public.reconcile_homework_completion_notification_attempt"),
    );

    expect(migration).toContain("create table public.homework_completion_notification_provider_evidence");
    expect(migration).toContain("unique (provider_name, evidence_identifier)");
    expect(migration).toContain("prevent_homework_completion_notification_provider_evidence_mutation");
    expect(reconcile).toContain("event:' || btrim(target_provider_event_id)");
    expect(reconcile).toContain("message:' || btrim(target_provider_message_id)");
    expect(reconcile).toContain("existing_evidence.outcome is distinct from provider_outcome");
    expect(reconcile).toContain("Conflicting provider evidence replay");
    expect(reconcile).toContain("Provider message ID is invalid");
    expect(migration).toContain("old.status = 'accepted' and new.status in ('delivered', 'bounced')");
    expect(reconcile).toContain("notification.status = 'cancelled'");
    expect(reconcile).not.toContain("set status = 'pending'");
    expect(reconcile).toContain("on conflict (provider_name, evidence_identifier) do nothing");
    expect(reconcile).toContain("private.homework_completion_notification_retry_delay(attempt.attempt_number)");
    expect(reconcile).toContain("next_parent_status := 'pending'");
    expect(reconcile).toContain("eligibility_lost_before_retry");
    expect(reconcile).toContain("retry_due >= frozen.idempotency_cutoff_at");
    expect(reconcile).toContain("next_detail := 'provider_idempotency_window_expired'");
    expect(reconcile).toContain("next_detail := 'retry_limit_reached'");
    expect(reconcile).toContain("attempt.is_manual_recovery");
    expect(reconcile).toContain("notification.status = 'cancelled'");
    expect(reconcile).toContain("or (attempt.status in ('rejected_retryable', 'rejected_permanent'))");
  });

  it("binds each provider key to a 23-hour cutoff at first durable start", () => {
    const payloadTable = migration.slice(
      migration.indexOf("create table public.homework_completion_notification_payloads"),
      migration.indexOf("alter table public.homework_completion_notification_payloads enable row level security"),
    );
    const prepare = migration.slice(
      migration.indexOf("create or replace function public.prepare_homework_completion_notification_payload"),
      migration.indexOf("revoke all on function public.prepare_homework_completion_notification_payload"),
    );
    const start = migration.slice(
      migration.indexOf("create or replace function public.authorize_homework_completion_notification_delivery"),
      migration.indexOf("revoke all on function public.authorize_homework_completion_notification_delivery"),
    );

    expect(payloadTable).toContain("first_provider_started_at timestamptz");
    expect(payloadTable).toContain("idempotency_cutoff_at timestamptz");
    expect(payloadTable).toContain("idempotency_cutoff_at = first_provider_started_at + interval '23 hours'");
    expect(prepare).toContain("'cutoffAt', frozen.idempotency_cutoff_at");
    expect(prepare).not.toContain("interval '23 hours'");
    expect(start).toContain("provider_started_at := clock_timestamp()");
    expect(start).toContain("set first_provider_started_at = provider_started_at");
    expect(start).toContain("attempt_count = attempt_count + 1");
    expect(start).toContain("notification.attempt_count >= 5");
    expect(start).toContain("frozen.idempotency_cutoff_at <= provider_started_at");
    expect(migration).toContain("first_provider_started_at + interval '23 hours'");
    expect(migration).not.toContain("first_provider_started_at + interval '24 hours'");
  });

  it("keeps the private delivery records inaccessible by direct table grants", () => {
    for (const table of [
      "homework_completion_notification_payloads",
      "homework_completion_notification_attempts",
      "homework_completion_notification_provider_evidence",
    ]) {
      expect(migration).toContain(
        `revoke all on public.${table} from public, anon, authenticated, service_role`,
      );
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("enforces durable-start accounting and valid unexpired worker leases", () => {
    const claim = migration.slice(
      migration.indexOf("create or replace function public.claim_due_homework_completion_notifications"),
      migration.indexOf("revoke all on function public.claim_due_homework_completion_notifications"),
    );
    const start = migration.slice(
      migration.indexOf("create or replace function public.authorize_homework_completion_notification_delivery"),
      migration.indexOf("revoke all on function public.authorize_homework_completion_notification_delivery"),
    );
    const finish = migration.slice(
      migration.indexOf("create or replace function public.finish_homework_completion_notification_attempt"),
      migration.indexOf("-- This is an outcome-only path"),
    );

    expect(claim).toContain("for update skip locked");
    expect(claim).toContain("claim_sequence = notification.claim_sequence + 1");
    expect(claim).not.toContain("attempt_count = notification.attempt_count + 1");
    expect(claim).toContain("status = 'expired_before_start'");
    expect(claim).toContain("status = 'uncertain'");
    expect(start.match(/lease_expires_at > clock_timestamp\(\)/g)).toHaveLength(4);
    expect(start).toContain("attempt_count = attempt_count + 1");
    expect(start).toContain("manual_recovery_used_at = case when attempt.is_manual_recovery then clock_timestamp()");
    expect(finish.match(/lease_expires_at > clock_timestamp\(\)/g)).toHaveLength(4);
    expect(finish).toContain("status = 'started'");
    expect(finish).toContain("Worker lease expired before outcome finalization");
  });

  it("keeps cancellation terminal while recording provider evidence separately", () => {
    const cancellation = migration.slice(
      migration.indexOf("create or replace function private.cancel_homework_completion_notifications"),
      migration.indexOf("revoke all on function private.cancel_homework_completion_notifications"),
    );
    const reopen = migration.slice(
      migration.indexOf("create or replace function public.reopen_participant_homework"),
      migration.indexOf("revoke all on function public.reopen_participant_homework"),
    );
    const reconcile = migration.slice(
      migration.indexOf("create or replace function public.reconcile_homework_completion_notification_attempt"),
      migration.indexOf("revoke all on function public.reconcile_homework_completion_notification_attempt"),
    );

    expect(cancellation).toContain("status in ('pending', 'claimed')");
    expect(cancellation).toContain("manual_recovery_recipient_group_id = target_group_id");
    expect(cancellation).toContain("manual_recovery_recipient_profile_ids @> array[target_profile_id]");
    expect(cancellation).toContain("cancellation_requested_at = case when attempt.started_at is not null");
    expect(reopen).toContain("status in ('pending', 'claimed')");
    expect(reconcile).toContain("Provider evidence identifier is required");
    expect(reconcile).toContain("if notification.status = 'cancelled' then");
    expect(reconcile).toContain("parent_status := 'cancelled'");
    expect(reconcile).not.toContain("set status = 'pending'");
    expect(migration).toContain("revoke all on function public.reconcile_homework_completion_notification_attempt(uuid, text, text, text, text) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.reconcile_homework_completion_notification_attempt(uuid, text, text, text, text) to service_role");
  });

  it("keeps attempt claim tokens and recipient payloads inaccessible to client roles", () => {
    expect(migration).toContain("create table public.homework_completion_notification_attempts");
    expect(migration).toContain("revoke all on public.homework_completion_notification_attempts from public, anon, authenticated, service_role");
    expect(migration).not.toContain("grant select on public.homework_completion_notification_attempts");
    expect(migration).toContain("guard_homework_completion_notification_attempt_identity");
    expect(migration).toContain("homework_completion_notification_manual_key_unique");
  });

  it("keeps notification rows private and leaves all email delivery outside this migration", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("homework_completion_notifications_admin_read");
    expect(migration).toContain("revoke all on public.homework_completion_notifications, public.homework_completion_notification_events from public, anon, authenticated, service_role");
    expect(migration).not.toMatch(/\.emails\.send|resend\.emails|send\s*\(/i);
    expect(migration).not.toContain("create or replace function public.record_homework_completion_notification_provider_event");
  });
});
