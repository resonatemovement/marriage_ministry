import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createOnboardingReminderEmailProvider, validateOnboardingReminderRecipient } from "./onboarding-reminder-safety";

const verifiedDev = {
  safetyMode: "true",
  vercel: "1",
  vercelEnv: "production",
  vercelProjectId: "prj_J5QbuVHBVRyQeq78Qd6G9HmJFbVt",
  vercelGitCommitRef: "main",
  supabaseUrl: "https://lctkqjjkhpyootwvttvj.supabase.co",
  allowedRecipients: "synthetic.partner@mailinator.com,synthetic.partner.two@mailinator.com",
};

describe("onboarding reminder DEV email safety", () => {
  it("allows an original Mailinator recipient only in the verified dedicated DEV production runtime", () => {
    expect(validateOnboardingReminderRecipient("synthetic.partner@mailinator.com", verifiedDev)).toEqual({ allowed: true });
    expect(validateOnboardingReminderRecipient("SYNTHETIC.PARTNER@MAILINATOR.COM", verifiedDev)).toEqual({ allowed: true });
    expect(validateOnboardingReminderRecipient("unlisted@mailinator.com", verifiedDev)).toEqual({ allowed: false, reason: "recipient_not_allowed" });
  });

  it.each([
    "partner@example.org",
    "partner@mailinator.com.example.org",
    "partner@sub.mailinator.com",
    "partner@resend.dev",
    " partner@mailinator.com",
    "partner@mailinator.com ",
    "partner@@mailinator.com",
    ".partner@mailinator.com",
    "partner..one@mailinator.com",
  ])("blocks non-allowed or malformed address %s without redirecting it", (recipient) => {
    expect(validateOnboardingReminderRecipient(recipient, verifiedDev)).toEqual({ allowed: false, reason: "recipient_not_allowed" });
  });

  it.each([
    { safetyMode: undefined },
    { safetyMode: "false" },
    { vercel: undefined },
    { vercelEnv: "preview" },
    { vercelEnv: undefined },
    { vercelProjectId: undefined },
    { vercelProjectId: "another-project" },
    { vercelGitCommitRef: undefined },
    { vercelGitCommitRef: "feature/branch" },
    { supabaseUrl: undefined },
    { supabaseUrl: "not-a-url" },
    { supabaseUrl: "http://lctkqjjkhpyootwvttvj.supabase.co" },
    { supabaseUrl: "https://other-project.supabase.co" },
    { supabaseUrl: "https://lctkqjjkhpyootwvttvj.supabase.co/other-path" },
  ])("fails closed when DEV identity or opt-in is missing or mismatched", (override) => {
    const environment = { ...verifiedDev, ...override };
    expect(validateOnboardingReminderRecipient("synthetic.partner@mailinator.com", environment)).not.toEqual({ allowed: true });
  });

  it("forwards the original allowed address unchanged", async () => {
    const send = vi.fn().mockResolvedValue({ success: true, providerMessageId: "test-message" });
    const provider = createOnboardingReminderEmailProvider({ send }, verifiedDev);
    const message = { to: "synthetic.partner@mailinator.com", subject: "Reminder", text: "Setup", html: "<p>Setup</p>" };

    await expect(provider.send(message)).resolves.toEqual({ success: true, providerMessageId: "test-message" });
    expect(send).toHaveBeenCalledWith(message);
  });

  it("does not redirect or send a blocked real-recipient address", async () => {
    const send = vi.fn();
    const provider = createOnboardingReminderEmailProvider({ send }, verifiedDev);

    await expect(provider.send({ to: "person@resonatemovement.org", subject: "Reminder", text: "Setup", html: "<p>Setup</p>" }))
      .resolves.toEqual({ success: false, errorCategory: "invalid_recipient", errorMessage: "Onboarding reminder recipient is not allowed." });
    expect(send).not.toHaveBeenCalled();
  });

  it("does not send if the explicit safety opt-in is missing", async () => {
    const send = vi.fn();
    const provider = createOnboardingReminderEmailProvider({ send }, { ...verifiedDev, safetyMode: undefined });

    await expect(provider.send({ to: "synthetic.partner@mailinator.com", subject: "Reminder", text: "Setup", html: "<p>Setup</p>" }))
      .resolves.toMatchObject({ success: false, errorCategory: "configuration" });
    expect(send).not.toHaveBeenCalled();
  });

  it("fails closed when the exact DEV recipient allowlist is missing or invalid", async () => {
    expect(validateOnboardingReminderRecipient("synthetic.partner@mailinator.com", { ...verifiedDev, allowedRecipients: undefined }))
      .toEqual({ allowed: false, reason: "recipients_unconfigured" });
    expect(validateOnboardingReminderRecipient("synthetic.partner@mailinator.com", { ...verifiedDev, allowedRecipients: "partner@example.org" }))
      .toEqual({ allowed: false, reason: "recipients_unconfigured" });
    expect(validateOnboardingReminderRecipient("synthetic.partner@mailinator.com", { ...verifiedDev, allowedRecipients: "one@mailinator.com,two@mailinator.com,three@mailinator.com,four@mailinator.com,five@mailinator.com,six@mailinator.com,seven@mailinator.com,eight@mailinator.com,nine@mailinator.com,ten@mailinator.com,eleven@mailinator.com" }))
      .toEqual({ allowed: false, reason: "recipients_unconfigured" });
  });
});
