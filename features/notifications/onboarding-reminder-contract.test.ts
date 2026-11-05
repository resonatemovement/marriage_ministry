import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261105120000_onboarding_reminder_delivery.sql", "utf8");
const fixMigration = readFileSync("supabase/migrations/20261105130000_fix_onboarding_reminder_claim_ambiguity.sql", "utf8");
const reminders = readFileSync("features/notifications/onboarding-reminders.ts", "utf8");
const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };

describe("onboarding reminder delivery contract", () => {
  it("keys idempotency by Intake Request, invitation identity, and the Invited status-history cycle", () => {
    expect(migration).toContain("unique (intake_request_id, invitation_id, invited_status_history_id)");
    expect(migration).toContain("where delivery.state = 'failed'");
    expect(migration).toContain("state = 'uncertain'");
  });

  it("keeps the forward fix for PL/pgSQL output-column ambiguity separate from the applied base migration", () => {
    expect(fixMigration).toContain("#variable_conflict use_column");
    expect(fixMigration).toContain("create or replace function public.claim_due_onboarding_reminder_deliveries");
  });

  it("uses configured thresholds and authoritative Invited status history", () => {
    expect(migration).toContain("intake_invited_onboarding_hours");
    expect(migration).toContain("status_history.to_status = 'invited'");
    expect(migration).toContain("make_interval(hours => settings.intake_invited_onboarding_hours)");
    expect(migration).toContain("profile.onboarding_completed_at is null");
    expect(migration).toContain("invitation.status in ('pending'::public.invitation_status, 'accepted'::public.invitation_status)");
  });

  it("restricts delivery RPCs to service role and exact passed allowlist recipients", () => {
    expect(migration.match(/auth\.jwt\(\) ->> 'role'\) is distinct from 'service_role'/g)).toHaveLength(3);
    expect(migration).toContain("lower(invitation.email) = any(normalized_allowlist)");
    expect(migration).toContain("onboarding_reminder_deliveries from public, anon, authenticated");
    expect(reminders).toContain("getConfiguredOnboardingReminderRecipients()");
    expect(reminders).toContain("createOnboardingReminderEmailProvider(provider)");
    expect(reminders).toContain("safeProvider.send(renderOnboardingReminderEmail");
  });

  it("does not add an automatic onboarding reminder schedule", () => {
    expect(vercelConfig.crons.some(({ path }) => path.includes("onboarding-reminders"))).toBe(false);
    expect(reminders).not.toContain("processDueMeetingReminders");
  });
});
