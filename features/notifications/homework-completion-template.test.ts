import { describe, expect, it } from "vitest";

import { HOMEWORK_COMPLETION_APP_URL, HOMEWORK_COMPLETION_LOGO_URL, renderHomeworkCompletionEmail } from "./homework-completion-template";

const context = {
  to: ["counselor-a@mailinator.com"],
  from: "notifications@example.test",
  replyTo: "support@example.test",
  notificationId: "notification-id",
  deliveryId: "delivery-id",
  attemptId: "attempt-id",
  completionCycle: 2,
  coupleNames: [{ firstName: "Alex", lastName: "Johnson" }, { firstName: "Taylor", lastName: "Smith" }],
  sessionNumber: 3,
  sessionTitle: "Listening well",
  caseId: "case/id",
  isUpdate: true,
};

describe("Homework completion email template", () => {
  it("renders approved metadata only and links to the authorized Session Homework review surface", () => {
    const message = renderHomeworkCompletionEmail(context);
    expect(message.to).toEqual(context.to);
    expect(message.to).toHaveLength(1);
    expect(message).not.toHaveProperty("cc");
    expect(message).not.toHaveProperty("bcc");
    expect(message.subject).toBe("Updated Homework Ready for Review — Alex & Taylor");
    expect(message.text).toContain("Alex Johnson and Taylor Smith");
    expect(message.text).toContain("Session 3: Listening well");
    expect(message.text).toContain("Both partners submitted");
    expect(message.text).toContain(`${HOMEWORK_COMPLETION_APP_URL}/workspace/cases/case%2Fid#homework`);
    expect(message.html).toContain(HOMEWORK_COMPLETION_LOGO_URL);
    expect(message.html).toContain("Arial,Helvetica,sans-serif");
    expect(message.tags).toEqual(expect.arrayContaining([
      { name: "notification_type", value: "homework_completion" },
      { name: "notification_delivery_id", value: "delivery-id" },
      { name: "notification_attempt_id", value: "attempt-id" },
    ]));
    expect(`${message.text}\n${message.html}`).not.toMatch(/answer|response|homework_answers/i);
  });

  it("uses the initial subject until a later completion cycle", () => {
    const message = renderHomeworkCompletionEmail({ ...context, isUpdate: false });
    expect(message.subject).toBe("Homework Ready for Review — Alex & Taylor");
  });

  it("refuses to render an email with more than one recipient", () => {
    expect(() => renderHomeworkCompletionEmail({ ...context, to: ["one@mailinator.com", "two@mailinator.com"] })).toThrow("exactly one recipient");
  });
});
