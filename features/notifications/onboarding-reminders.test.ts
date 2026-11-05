import { describe, expect, it } from "vitest";

import { ONBOARDING_REMINDER_LOGO_URL, renderOnboardingReminderEmail } from "./onboarding-reminder-template";

describe("onboarding reminder email", () => {
  it("places the official publicly hosted logo above the reminder in email-compatible markup", () => {
    const message = renderOnboardingReminderEmail("synthetic@mailinator.com", "https://resonate.example/login");
    expect(ONBOARDING_REMINDER_LOGO_URL).toBe("https://marriage-ministry-dev.vercel.app/images/logo-email.png");
    expect(message.html.indexOf("<img")).toBeLessThan(message.html.indexOf("Your Resonate account setup"));
    expect(message.html).toContain(`src="${ONBOARDING_REMINDER_LOGO_URL}"`);
    expect(message.html).toContain('width="48" height="51" alt="Resonate logo"');
    expect(message.html).toContain('style="display:block;width:48px;height:auto;max-width:100%');
    expect(message.text).toContain("Resonate Marriage Ministry");
  });

  it("uses a generic sign-in link and contains no personal or invitation secrets", () => {
    const message = renderOnboardingReminderEmail("synthetic@mailinator.com", "https://resonate.example/login");
    expect(message.to).toBe("synthetic@mailinator.com");
    expect(message.subject).toBe("Continue setting up your Resonate account");
    expect(message.text).toContain("https://resonate.example/login");
    expect(message.html).toContain('href="https://resonate.example/login"');
    expect(message.text + message.html).not.toMatch(/partner|couple|password|token|invite[_-]?token|magic[_-]?link/i);
    expect(message.text + message.html).not.toMatch(/first|last|email address|another person/i);
    expect(message.tags).toEqual([{ name: "category", value: "onboarding_reminder" }]);
  });

  it("escapes a configured URL before including it in HTML", () => {
    const message = renderOnboardingReminderEmail("synthetic@mailinator.com", "https://resonate.example/login?a=one&b=two");
    expect(message.html).toContain("&amp;");
    expect(message.html).not.toContain("&b=two");
  });
});
