import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "@/lib/supabase/env";

import { recordDeliveryFailure, sendDeliveryAttempt } from "./delivery";
import { createResendEmailProvider } from "./provider";
import { eligibleAdminRecipients, type AdminRecipientProfile } from "./recipients";
import { notificationTemplateDefaults, renderAdminIntakeSubmittedEmail, renderCoupleIntakeSubmittedEmail } from "./templates";
import type { DeliveryStore } from "./types";

type IntakeRow = {
  id: string;
  relationship_status: string;
  requested_support: string[];
  submitted_at: string;
  campus: { name: string } | null;
  campus_other: string | null;
  people: { person_position: "requester" | "partner"; first_name: string; last_name: string; email: string }[] | null;
};
type RoleRow = { profile_id: string; role: string };

function createServiceClient() {
  const { url } = getSupabaseEnvironment();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("Notifications are not configured.");
  return createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function createDeliveryStore(client: ReturnType<typeof createServiceClient>): DeliveryStore {
  return {
    async create(input) {
      const { data, error } = await client.from("notification_deliveries" as never).insert({
        event_type: input.eventType,
        related_entity_type: input.relatedEntityType,
        related_entity_id: input.relatedEntityId,
        template_key: input.templateKey,
        channel: input.channel,
        recipient_profile_id: input.recipientProfileId,
        recipient_email: input.recipientEmail,
      } as never).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Unable to record notification delivery.");
      return (data as unknown as { id: string }).id;
    },
    async markSent(id, providerMessageId) {
      const { error } = await client.from("notification_deliveries" as never).update({ status: "sent", provider_message_id: providerMessageId, sent_at: new Date().toISOString() } as never).eq("id", id);
      if (error) throw new Error(error.message);
    },
    async markFailed(id, errorCategory, errorMessage) {
      const { error } = await client.from("notification_deliveries" as never).update({ status: "failed", error_category: errorCategory, error_message: errorMessage.slice(0, 500), failed_at: new Date().toISOString() } as never).eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}

const relationshipLabels: Record<string, string> = { pre_engaged: "Pre-engaged", engaged: "Engaged", married: "Married" };
const supportLabels: Record<string, string> = { lay_counselor: "Lay counselor", professional_referral: "Professional referral" };

async function safeDelivery(attempt: () => Promise<unknown>) {
  try { await attempt(); } catch (error) { console.error("Intake notification delivery could not be recorded or sent.", error); }
}

export async function dispatchIntakeSubmittedNotifications(intakeRequestId: string) {
  try {
    const client = createServiceClient();
    const [{ data: intakeData, error: intakeError }, { data: roleData, error: roleError }] = await Promise.all([
      client.from("intake_requests" as never).select("id,relationship_status,requested_support,submitted_at,campus_other,campus:campuses(name),people:intake_request_people(person_position,first_name,last_name,email)").eq("id", intakeRequestId).maybeSingle(),
      client.from("profile_roles").select("profile_id,role").in("role", ["admin", "super_admin"]),
    ]);
    if (intakeError || roleError || !intakeData) throw new Error(intakeError?.message ?? roleError?.message ?? "Submitted Intake Request is unavailable.");
    const roles = (roleData ?? []) as RoleRow[];
    const profileIds = [...new Set(roles.map((role) => role.profile_id))];
    const { data: profileData, error: profileError } = profileIds.length
      ? await client.from("profiles").select("id,email,status").in("id", profileIds).eq("status", "active")
      : { data: [], error: null };
    if (profileError) throw new Error(profileError.message);
    const rolesByProfile = new Map<string, { role: string }[]>();
    for (const role of roles) rolesByProfile.set(role.profile_id, [...(rolesByProfile.get(role.profile_id) ?? []), { role: role.role }]);
    const eligibleProfiles = (profileData ?? []).map((profile) => ({ ...profile, profile_roles: rolesByProfile.get(profile.id) ?? [] })) as AdminRecipientProfile[];

    const intake = intakeData as unknown as IntakeRow;
    const people = intake.people ?? [];
    const requester = people.find((person) => person.person_position === "requester");
    const partner = people.find((person) => person.person_position === "partner");
    if (!requester || !partner) throw new Error("Submitted Intake Request people are unavailable.");

    const store = createDeliveryStore(client);
    const provider = createResendEmailProvider();
    const coupleName = `${requester.first_name} ${requester.last_name} & ${partner.first_name} ${partner.last_name}`;
    const submittedDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(intake.submitted_at));
    const requestedSupport = intake.requested_support.map((support) => supportLabels[support] ?? support).join(", ");
    const attempts: Array<Promise<void>> = [
      safeDelivery(() => sendDeliveryAttempt({ eventType: "intake.submitted", relatedEntityType: "intake_request", relatedEntityId: intake.id, templateKey: "intake_submitted_couple_email", channel: notificationTemplateDefaults.intake_submitted_couple_email.channel, recipientProfileId: null, recipientEmail: requester.email, message: renderCoupleIntakeSubmittedEmail({ firstName: requester.first_name }, requester.email) }, store, provider)),
      safeDelivery(() => sendDeliveryAttempt({ eventType: "intake.submitted", relatedEntityType: "intake_request", relatedEntityId: intake.id, templateKey: "intake_submitted_couple_email", channel: notificationTemplateDefaults.intake_submitted_couple_email.channel, recipientProfileId: null, recipientEmail: partner.email, message: renderCoupleIntakeSubmittedEmail({ firstName: partner.first_name }, partner.email) }, store, provider)),
    ];
    const appUrl = process.env.APP_URL;
    if (appUrl) {
      const reviewUrl = new URL(`/intake-requests/${intake.id}`, appUrl).toString();
      for (const admin of eligibleAdminRecipients(eligibleProfiles)) {
        attempts.push(safeDelivery(() => sendDeliveryAttempt({ eventType: "intake.submitted", relatedEntityType: "intake_request", relatedEntityId: intake.id, templateKey: "intake_submitted_admin_email", channel: notificationTemplateDefaults.intake_submitted_admin_email.channel, recipientProfileId: admin.profileId, recipientEmail: admin.email, message: renderAdminIntakeSubmittedEmail({ coupleName, relationshipStatus: relationshipLabels[intake.relationship_status] ?? intake.relationship_status, campusName: intake.campus?.name ?? intake.campus_other ?? "Not provided", submittedDate, requestedSupport, reviewUrl }, admin.email) }, store, provider)));
      }
    } else {
      for (const admin of eligibleAdminRecipients(eligibleProfiles)) {
        attempts.push(safeDelivery(() => recordDeliveryFailure({ eventType: "intake.submitted", relatedEntityType: "intake_request", relatedEntityId: intake.id, templateKey: "intake_submitted_admin_email", channel: notificationTemplateDefaults.intake_submitted_admin_email.channel, recipientProfileId: admin.profileId, recipientEmail: admin.email }, store, "configuration", "Admin intake notification requires APP_URL.")));
      }
    }
    await Promise.all(attempts);
  } catch (error) {
    console.error("Intake notification dispatch failed after intake submission.", error);
  }
}
