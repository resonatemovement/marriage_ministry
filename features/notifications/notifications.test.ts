import { describe, expect, it } from "vitest";

import { sendDeliveryAttempt } from "./delivery";
import { mapResendFailure } from "./provider-errors";
import { eligibleAdminRecipients } from "./recipients";
import { renderAdminIntakeSubmittedEmail, renderCoupleIntakeSubmittedEmail } from "./templates";
import type { DeliveryStore, EmailProvider } from "./types";

const message = { to: "person@example.test", subject: "Subject", text: "Text", html: "<p>Text</p>" };
const input = { eventType: "intake.submitted" as const, relatedEntityType: "intake_request" as const, relatedEntityId: "e5a8c860-253c-4afc-a6dd-208c987e3e09", templateKey: "intake_submitted_couple_email" as const, channel: "email" as const, recipientProfileId: null, recipientEmail: message.to, message };

function store(): DeliveryStore & { sent: string[]; failed: string[] } {
  const sent: string[] = []; const failed: string[] = [];
  return { sent, failed, create: async () => "delivery-id", markSent: async () => { sent.push("delivery-id"); }, markFailed: async () => { failed.push("delivery-id"); } };
}

describe("intake notifications", () => {
  it("deduplicates active Admin and Super Admin email recipients", () => {
    expect(eligibleAdminRecipients([
      { id: "one", email: "admin@example.test", status: "active", profile_roles: [{ role: "admin" }, { role: "super_admin" }] },
      { id: "two", email: "ADMIN@example.test", status: "active", profile_roles: [{ role: "super_admin" }] },
      { id: "three", email: "inactive@example.test", status: "deactivated", profile_roles: [{ role: "admin" }] },
      { id: "four", email: "coach@example.test", status: "active", profile_roles: [{ role: "coach" }] },
    ])).toEqual([{ profileId: "one", email: "admin@example.test" }]);
  });

  it("renders non-sensitive Admin content and escaped template variables", () => {
    const rendered = renderAdminIntakeSubmittedEmail({ coupleName: "Avery & Blair", relationshipStatus: "Married", campusName: "North", submittedDate: "Sep 9, 2026", requestedSupport: "Lay counselor", reviewUrl: "https://example.test/intake-requests/id" }, "admin@example.test");
    expect(rendered.subject).toContain("Avery & Blair");
    expect(rendered.text).not.toContain("private counseling goals");
    expect(rendered.html).toContain("Review Intake Request");
  });

  it("renders independent couple confirmations", () => {
    expect(renderCoupleIntakeSubmittedEmail({ firstName: "Avery" }, "avery@example.test").text).toContain("Hi Avery");
    expect(renderCoupleIntakeSubmittedEmail({ firstName: "Blair" }, "blair@example.test").text).toContain("Hi Blair");
  });

  it("records one provider failure without preventing other deliveries", async () => {
    const failedStore = store(); const sentStore = store();
    const failure: EmailProvider = { send: async () => ({ success: false, errorCategory: "provider_unavailable", errorMessage: "Unavailable" }) };
    const success: EmailProvider = { send: async () => ({ success: true, providerMessageId: "message-id" }) };
    await Promise.all([sendDeliveryAttempt(input, failedStore, failure), sendDeliveryAttempt(input, sentStore, success)]);
    expect(failedStore.failed).toEqual(["delivery-id"]);
    expect(sentStore.sent).toEqual(["delivery-id"]);
  });

  it("maps provider errors to a safe category", () => {
    expect(mapResendFailure(new Error("recipient is invalid: person@example.test"))).toMatchObject({ success: false, errorCategory: "invalid_recipient", errorMessage: expect.not.stringContaining("person@example.test") });
    expect(mapResendFailure({ message: "The from address is not verified" })).toMatchObject({ success: false, errorCategory: "configuration", errorMessage: "The from address is not verified" });
  });
});
