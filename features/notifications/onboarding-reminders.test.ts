import { describe, expect, it } from "vitest";

import { renderOnboardingReminderEmail } from "./onboarding-reminder-template";

describe("onboarding reminder email", () => {
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
