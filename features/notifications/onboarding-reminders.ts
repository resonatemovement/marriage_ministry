import "server-only";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

import { createResendEmailProvider } from "./provider";
import { createOnboardingReminderEmailProvider, getConfiguredOnboardingReminderRecipients } from "./onboarding-reminder-safety";
import { renderOnboardingReminderEmail } from "./onboarding-reminder-template";
import type { EmailProvider } from "./types";

type ReminderClaim = {
  delivery_id: string;
  claim_token: string;
  intake_request_id: string;
  invitation_id: string;
  invited_status_history_id: number;
  recipient_email: string;
};

type ReminderRpcClient = ReturnType<typeof createServiceRoleSupabaseClient>;

function appLoginUrl() {
  return "https://marriage-ministry-dev.vercel.app/login";
}

function parseClaims(value: unknown): ReminderClaim[] {
  if (!Array.isArray(value)) throw new Error("Onboarding reminder claim response is invalid.");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Onboarding reminder claim row is invalid.");
    const row = item as Record<string, unknown>;
    if (typeof row.delivery_id !== "string"
      || typeof row.claim_token !== "string"
      || typeof row.intake_request_id !== "string"
      || typeof row.invitation_id !== "string"
      || typeof row.invited_status_history_id !== "number"
      || typeof row.recipient_email !== "string") throw new Error("Onboarding reminder claim row is incomplete.");
    return {
      delivery_id: row.delivery_id,
      claim_token: row.claim_token,
      intake_request_id: row.intake_request_id,
      invitation_id: row.invitation_id,
      invited_status_history_id: row.invited_status_history_id,
      recipient_email: row.recipient_email,
    };
  });
}

async function finishDelivery(
  client: ReminderRpcClient,
  claim: ReminderClaim,
  state: "sent" | "failed" | "uncertain",
  result?: { providerMessageId?: string | null; errorCategory?: string; errorMessage?: string },
) {
  const { data, error } = await client.rpc("finish_onboarding_reminder_delivery", {
    target_delivery_id: claim.delivery_id,
    target_claim_token: claim.claim_token,
    next_state: state,
    next_provider_message_id: result?.providerMessageId ?? undefined,
    next_error_category: result?.errorCategory ?? undefined,
    next_error_message: result?.errorMessage ?? undefined,
  });
  if (error || data !== true) throw new Error("Unable to finalize onboarding reminder delivery safely.");
}

export async function processOnboardingReminderEmails(provider: EmailProvider = createResendEmailProvider()) {
  const allowedRecipients = getConfiguredOnboardingReminderRecipients();
  if (!allowedRecipients) throw new Error("Onboarding reminder safety configuration is unavailable.");
  const safeProvider = createOnboardingReminderEmailProvider(provider);
  const loginUrl = appLoginUrl();
  const rpc = createServiceRoleSupabaseClient();
  const { data, error } = await rpc.rpc("claim_due_onboarding_reminder_deliveries", {
    allowed_recipients: allowedRecipients,
    claim_limit: 50,
  });
  if (error) throw new Error("Unable to claim onboarding reminders.");

  const claims = parseClaims(data);
  const result = { claimed: claims.length, sent: 0, failed: 0, uncertain: 0, skipped: 0 };
  for (const claim of claims) {
    const authorized = await rpc.rpc("authorize_onboarding_reminder_delivery", {
      target_delivery_id: claim.delivery_id,
      target_claim_token: claim.claim_token,
      allowed_recipients: allowedRecipients,
    });
    if (authorized.error) throw new Error("Unable to recheck onboarding reminder eligibility.");
    if (authorized.data !== true) {
      result.skipped += 1;
      continue;
    }

    let sendResult;
    try {
      sendResult = await safeProvider.send(renderOnboardingReminderEmail(claim.recipient_email, loginUrl));
    } catch {
      await finishDelivery(rpc, claim, "uncertain", {
        errorCategory: "provider_exception",
        errorMessage: "Provider outcome is unknown; automatic retry was withheld.",
      });
      result.uncertain += 1;
      continue;
    }

    if (sendResult.success) {
      await finishDelivery(rpc, claim, "sent", { providerMessageId: sendResult.providerMessageId });
      result.sent += 1;
      continue;
    }

    const state = sendResult.deliveryCertainty === "rejected"
      || sendResult.errorCategory === "configuration"
      || sendResult.errorCategory === "invalid_recipient"
      ? "failed"
      : "uncertain";
    await finishDelivery(rpc, claim, state, {
      errorCategory: sendResult.errorCategory,
      errorMessage: sendResult.errorMessage,
    });
    result[state] += 1;
  }

  return result;
}
