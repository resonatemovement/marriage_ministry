import "server-only";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { orderCouplePartners } from "@/features/people/partner-order";
import { createResendEmailProvider } from "./provider";
import { getHomeworkCompletionAutomaticDevScope } from "./homework-completion-automatic-dev-scope";
import { getHomeworkCompletionDevTestConfig } from "./homework-completion-dev-test";
import type { HomeworkCompletionDevTestConfig } from "./homework-completion-dev-test";
import { HOMEWORK_COMPLETION_APP_URL, renderHomeworkCompletionEmail } from "./homework-completion-template";
import type { EmailMessage, EmailProvider } from "./types";

type RawClient = { rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string; code?: string } | null }> };
type Claim = { notification_id: string; delivery_id: string; claim_token: string; manual_recovery: boolean };
type Partner = { profile_id: string; first_name: string; last_name: string; gender: string | null };
type DeliveryContext = {
  notification_id: string;
  delivery_id: string;
  case_id: string;
  case_session_id: string;
  completion_cycle: number;
  session_title: string;
  session_number: number;
  recipient_profile_id: string;
  recipient_email: string | null;
  partners: Partner[];
};
type ProviderPayload = { to: string[]; from: string; replyTo: string; subject: string; html: string; text: string; tags?: { name: string; value: string }[] };

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const str = (value: unknown) => typeof value === "string" ? value : "";
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
function validSender(value: string) {
  if (validEmail(value)) return true;
  const match = /^[^<>\r\n]{1,100}\s+<([^<>\s]+)>$/.exec(value);
  return Boolean(match && validEmail(match[1]));
}

function parseClaim(value: unknown): Claim[] {
  if (!Array.isArray(value)) throw new Error("Homework recipient delivery claim response is invalid.");
  return value.map((item) => {
    const row = object(item);
    if (typeof row.notification_id !== "string" || typeof row.delivery_id !== "string"
      || typeof row.claim_token !== "string" || typeof row.manual_recovery !== "boolean") {
      throw new Error("Homework recipient delivery claim is incomplete.");
    }
    return { notification_id: row.notification_id, delivery_id: row.delivery_id, claim_token: row.claim_token, manual_recovery: row.manual_recovery };
  });
}

function parsePayload(value: unknown): ProviderPayload {
  const row = object(value);
  const to = Array.isArray(row.to) ? row.to.filter((email): email is string => typeof email === "string") : [];
  const tags = Array.isArray(row.tags) ? row.tags.flatMap((item) => {
    const tag = object(item);
    return typeof tag.name === "string" && typeof tag.value === "string" ? [{ name: tag.name, value: tag.value }] : [];
  }) : undefined;
  const result = { to, from: str(row.from), replyTo: str(row.replyTo), subject: str(row.subject), html: str(row.html), text: str(row.text), ...(tags ? { tags } : {}) };
  if (result.to.length !== 1 || result.to.some((email) => !validEmail(email)) || !validSender(result.from)
    || !validEmail(result.replyTo) || !result.subject || !result.html || !result.text) {
    throw new Error("Frozen Homework notification payload is invalid.");
  }
  return result;
}

async function rpc(client: RawClient, name: string, args: Record<string, unknown>) {
  const result = await client.rpc(name, args);
  if (result.error) {
    const recipientFailure = result.error.message.match(/recipient_email_(missing|invalid)/)?.[0];
    throw new Error(recipientFailure ?? `Homework notification ${name} failed (${result.error.code ?? "unknown"}).`);
  }
  return result.data;
}

async function getMetadata(client: RawClient, claim: Claim, allowedRecipients: readonly string[]) {
  const raw = object(await rpc(client, "get_homework_completion_recipient_delivery_context", {
    target_notification_id: claim.notification_id,
    target_delivery_id: claim.delivery_id,
    target_claim_token: claim.claim_token,
  }));
  const notification = raw as unknown as DeliveryContext;
  if (notification.notification_id !== claim.notification_id || notification.delivery_id !== claim.delivery_id
    || typeof notification.case_id !== "string" || typeof notification.case_session_id !== "string"
    || typeof notification.completion_cycle !== "number" || typeof notification.session_number !== "number"
    || typeof notification.session_title !== "string" || typeof notification.recipient_profile_id !== "string"
    || !Array.isArray(notification.partners)) throw new Error("Homework recipient delivery context is unavailable.");
  const partners = notification.partners.filter((partner) => partner && typeof partner.profile_id === "string"
    && typeof partner.first_name === "string" && typeof partner.last_name === "string");
  if (partners.length !== 2) throw new Error("Homework Couple details are unavailable.");
  const orderedPartners = orderCouplePartners(partners.map((partner) => ({ profileId: partner.profile_id,
    name: `${partner.first_name} ${partner.last_name}`.trim(),
    gender: partner.gender === "male" || partner.gender === "female" ? partner.gender : null })));
  const partnerById = new Map(partners.map((partner) => [partner.profile_id, partner]));
  const coupleNames = orderedPartners.flatMap(({ profileId }) => {
    const partner = partnerById.get(profileId);
    return partner ? [{ firstName: partner.first_name, lastName: partner.last_name }] : [];
  });
  const recipientEmail = typeof notification.recipient_email === "string" ? notification.recipient_email.trim().toLowerCase() : "";
  if (coupleNames.length !== 2) throw new Error("Homework Couple details are unavailable.");
  if (!recipientEmail || !validEmail(recipientEmail)) throw new Error(recipientEmail ? "recipient_email_invalid" : "recipient_email_missing");
  if (!allowedRecipients.includes(recipientEmail)) return { notification, recipientEmail, allowed: false as const };
  return { notification, recipientEmail, allowed: true as const, coupleNames };
}

async function getAttemptId(client: RawClient, claim: Claim) {
  const data = await rpc(client, "get_homework_completion_notification_attempt_id", {
    target_notification_id: claim.notification_id,
    target_claim_token: claim.claim_token,
  });
  if (typeof data !== "string") throw new Error("Homework recipient delivery attempt is unavailable.");
  return data;
}

function canonicalPayload(
  metadata: Awaited<ReturnType<typeof getMetadata>>,
  claim: Claim,
  attemptId: string,
  sender?: { from: string; replyTo: string },
) {
  if (!metadata.allowed) return null;
  const from = (sender?.from ?? process.env.NOTIFICATION_FROM_EMAIL)?.trim();
  const replyTo = (sender?.replyTo ?? process.env.NOTIFICATION_REPLY_TO_EMAIL)?.trim();
  if (!from || !replyTo) throw new Error("Notification sender configuration is unavailable.");
  return renderHomeworkCompletionEmail({
    to: [metadata.recipientEmail], from, replyTo,
    notificationId: metadata.notification.notification_id,
    deliveryId: claim.delivery_id,
    attemptId,
    completionCycle: metadata.notification.completion_cycle,
    coupleNames: metadata.coupleNames,
    sessionNumber: metadata.notification.session_number,
    sessionTitle: metadata.notification.session_title,
    caseId: metadata.notification.case_id,
    isUpdate: metadata.notification.completion_cycle > 1,
  });
}

async function finishAttempt(client: RawClient, claim: Claim, outcome: string, options: Record<string, unknown> = {}) {
  const status = await rpc(client, "finish_homework_completion_recipient_attempt", {
    target_notification_id: claim.notification_id,
    target_delivery_id: claim.delivery_id,
    target_claim_token: claim.claim_token,
    provider_outcome: outcome,
    ...options,
  });
  if (typeof status !== "string") throw new Error("Homework recipient delivery lease expired before outcome finalization.");
  return status;
}

async function processClaimedDeliveries(
  client: RawClient,
  claims: Claim[],
  allowedRecipients: readonly string[],
  provider: EmailProvider,
  sender?: { from: string; replyTo: string },
) {
  const result = { claimed: claims.length, accepted: 0, delivered: 0, retryScheduled: 0, failed: 0, uncertain: 0, skipped: 0, blockedByDevAllowlist: 0 };

  for (const claim of claims) {
    try {
      const metadata = await getMetadata(client, claim, allowedRecipients);
      if (!metadata.allowed) { result.blockedByDevAllowlist++; continue; }
      const attemptId = await getAttemptId(client, claim);
      const candidate = canonicalPayload(metadata, claim, attemptId, sender);
      if (!candidate) throw new Error("Homework notification content is unavailable.");
      const prepared = object(await rpc(client, "prepare_homework_completion_recipient_payload", {
        target_notification_id: claim.notification_id,
        target_delivery_id: claim.delivery_id,
        target_claim_token: claim.claim_token,
        target_provider_payload: candidate,
      }));
      const idempotencyKey = str(prepared.idempotencyKey);
      const frozenPayload = parsePayload(prepared.payload);
      if (!idempotencyKey) throw new Error("Homework notification idempotency key is unavailable.");
      const authorized = object(await rpc(client, "authorize_homework_completion_recipient_delivery", {
        target_notification_id: claim.notification_id,
        target_delivery_id: claim.delivery_id,
        target_claim_token: claim.claim_token,
      }));
      if (!Object.keys(authorized).length) { result.skipped++; continue; }
      const authorizedPayload = parsePayload(authorized.providerPayload);
      const authorizedKey = str(authorized.idempotencyKey);
      if (!authorizedKey || authorizedKey !== idempotencyKey || JSON.stringify(frozenPayload) !== JSON.stringify(authorizedPayload)) {
        throw new Error("Authorized Homework notification payload changed unexpectedly.");
      }
      const cutoffAt = str(authorized.idempotencyCutoffAt);
      const cutoffTime = Date.parse(cutoffAt);
      if (!cutoffAt || !Number.isFinite(cutoffTime) || Date.now() >= cutoffTime) {
        console.error("Homework notification cutoff check failed immediately before send.");
        const status = await finishAttempt(client, claim, "rejected_permanent", { target_error_category: "provider_idempotency_window_expired" });
        if (status === "failed") result.failed++;
        continue;
      }
      const sendMessage: EmailMessage = { ...authorizedPayload, idempotencyKey: authorizedKey };
      const sendResult = await provider.send(sendMessage);
      if (sendResult.success) {
        const status = await finishAttempt(client, claim, "accepted", { target_provider_message_id: sendResult.providerMessageId });
        if (status === "sent" || status === "delivered") result.accepted++;
        else if (status === "cancelled") result.skipped++;
        continue;
      }
      if (sendResult.deliveryCertainty === "unknown") {
        const status = await finishAttempt(client, claim, "uncertain", { target_error_category: sendResult.errorCategory });
        if (status === "uncertain") result.uncertain++;
        else if (status === "cancelled") result.skipped++;
      } else if (sendResult.errorCategory === "invalid_recipient" || sendResult.errorCategory === "configuration") {
        const status = await finishAttempt(client, claim, "rejected_permanent", { target_error_category: sendResult.errorCategory });
        if (status === "failed") result.failed++;
        else if (status === "cancelled") result.skipped++;
      } else {
        const status = await finishAttempt(client, claim, "rejected_retryable", { target_error_category: sendResult.errorCategory });
        if (status === "pending") result.retryScheduled++;
        else if (status === "failed") result.failed++;
        else if (status === "cancelled") result.skipped++;
      }
    } catch (error) {
      console.error("Homework completion notification processing failed.", {
        notificationId: claim.notification_id,
        deliveryId: claim.delivery_id,
        category: error instanceof Error && error.message.includes("recipient_email_") ? error.message : "processing_error",
      });
      if (error instanceof Error && /recipient_email_(missing|invalid)/.test(error.message)) {
        const failureCode = error.message.match(/recipient_email_(missing|invalid)/)?.[0];
        if (failureCode) await rpc(client, "fail_homework_completion_recipient_before_delivery", {
          target_notification_id: claim.notification_id,
          target_delivery_id: claim.delivery_id,
          target_claim_token: claim.claim_token,
          failure_code: failureCode,
        }).catch(() => null);
      }
    }
  }
  return result;
}

function assertProviderConfiguration() {
  if (!process.env.RESEND_API_KEY || !process.env.NOTIFICATION_FROM_EMAIL || !process.env.NOTIFICATION_REPLY_TO_EMAIL) {
    throw new Error("Homework notification provider configuration is unavailable.");
  }
}

function getDevTestProviderConfiguration(executionMode: HomeworkCompletionDevTestConfig["executionMode"]) {
  // Local-only verification intentionally reuses the established Resend integration.
  // Preview stays isolated and must use its dedicated DEV-only provider configuration.
  const local = executionMode === "local";
  const apiKey = (local ? process.env.RESEND_API_KEY : process.env.HOMEWORK_NOTIFICATION_DEV_TEST_RESEND_API_KEY)?.trim();
  const from = (local ? process.env.NOTIFICATION_FROM_EMAIL : process.env.HOMEWORK_NOTIFICATION_DEV_TEST_FROM_EMAIL)?.trim();
  const replyTo = (local ? process.env.NOTIFICATION_REPLY_TO_EMAIL : process.env.HOMEWORK_NOTIFICATION_DEV_TEST_REPLY_TO_EMAIL)?.trim();
  if (!apiKey || !from || !replyTo || !validSender(from) || !validEmail(replyTo)) {
    throw new Error("DEV test email provider configuration is unavailable.");
  }
  return { apiKey, from, replyTo };
}

export async function processHomeworkCompletionNotifications(provider: EmailProvider = createResendEmailProvider()) {
  const scope = getHomeworkCompletionAutomaticDevScope();
  if (!scope) throw new Error("Homework notification DEV safety is not configured.");
  assertProviderConfiguration();
  const client = createServiceRoleSupabaseClient() as unknown as RawClient;
  const claims = parseClaim(await rpc(client, "claim_due_homework_completion_dev_recipient_deliveries", {
    claim_limit: 25,
    target_recipient_emails: [...scope.allowedRecipients].sort(),
  }));
  const scopedProvider: EmailProvider = {
    async send(message) {
      const recipients = Array.isArray(message.to) ? message.to : [message.to];
      if (recipients.length !== 1 || !scope.allowedRecipients.includes(recipients[0]!.trim().toLowerCase())) {
        return { success: false, errorCategory: "invalid_recipient", errorMessage: "Homework notification recipient is outside the approved DEV scope." };
      }
      return provider.send(message);
    },
  };
  return processClaimedDeliveries(client, claims, scope.allowedRecipients, scopedProvider);
}

export async function processHomeworkCompletionDevTestNotification(
  config: HomeworkCompletionDevTestConfig,
  injectedProvider?: EmailProvider,
) {
  const verifiedConfig = getHomeworkCompletionDevTestConfig();
  if (!verifiedConfig
    || verifiedConfig.executionMode !== config.executionMode
    || verifiedConfig.notificationId !== config.notificationId
    || verifiedConfig.caseSessionId !== config.caseSessionId
    || verifiedConfig.coupleGroupId !== config.coupleGroupId
    || verifiedConfig.allowedRecipients.length !== config.allowedRecipients.length
    || verifiedConfig.allowedRecipients.some((email, index) => email !== config.allowedRecipients[index])) {
    throw new Error("Homework notification DEV test scope is not verified.");
  }
  const providerConfiguration = getDevTestProviderConfiguration(config.executionMode);
  const provider = injectedProvider ?? createResendEmailProvider(providerConfiguration);
  const client = createServiceRoleSupabaseClient() as unknown as RawClient;
  const claims = parseClaim(await rpc(client, "claim_homework_completion_dev_test_notification", {
    target_notification_id: config.notificationId,
    target_case_session_id: config.caseSessionId,
    target_couple_group_id: config.coupleGroupId,
    target_recipient_emails: [...config.allowedRecipients].sort(),
  }));
  if (claims.length !== 2 || claims.some((claim) => claim.notification_id !== config.notificationId)) {
    throw new Error("DEV test notification claim did not match the configured scope.");
  }
  const guardedProvider: EmailProvider = {
    async send(message) {
      const recipients = Array.isArray(message.to) ? message.to : [message.to];
      if (recipients.length !== 1 || !config.allowedRecipients.includes(recipients[0]!.trim().toLowerCase())) {
        return { success: false, errorCategory: "configuration", errorMessage: "DEV test recipient is outside the allowlist." };
      }
      return provider.send(message);
    },
  };
  return processClaimedDeliveries(client, claims, config.allowedRecipients, guardedProvider, {
    from: providerConfiguration.from,
    replyTo: providerConfiguration.replyTo,
  });
}

export const homeworkCompletionDeliveryInternals = { parseClaim, parsePayload, getMetadata, canonicalPayload, HOMEWORK_COMPLETION_APP_URL };
