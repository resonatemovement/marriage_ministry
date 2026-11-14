import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const handoff = readFileSync(new URL("./photo-handoff.tsx", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const onboardingForm = readFileSync(new URL("./onboarding-form.tsx", import.meta.url), "utf8");
const handoffPage = readFileSync(new URL("../../app/onboarding/photo-handoff/[token]/page.tsx", import.meta.url), "utf8");

describe("onboarding phone handoff visibility", () => {
  it("keeps the QR handoff entry rendered by default for desktop", () => {
    expect(handoff).toContain('className="onboarding-phone-handoff mt-3"');
    expect(handoff).toContain('"Take photo on phone"');
    expect(globalStyles).toMatch(/@media\s*\(pointer:\s*coarse\)\s*\{\s*\.onboarding-phone-handoff\s*\{\s*display:\s*none;/);
    expect(globalStyles.slice(0, globalStyles.indexOf("@media (pointer: coarse)"))).not.toContain(".onboarding-phone-handoff");
  });

  it("uses pointer capability rather than viewport width without client device state", () => {
    expect(globalStyles).toContain("@media (pointer: coarse)");
    expect(globalStyles).not.toMatch(/@media\s*\([^)]*max-width[^)]*\)[^{]*\{\s*\.onboarding-phone-handoff/);
    expect(handoff).not.toMatch(/navigator\.userAgent|matchMedia|useMediaQuery/);
  });

  it("leaves direct onboarding photo capture and the scanned-QR destination intact", () => {
    expect(onboardingForm).toContain("<ProfilePhotoField");
    expect(onboardingForm).toContain("<PhotoHandoff");
    expect(handoffPage).toContain("<PhonePhotoUpload token={token} />");
    expect(handoffPage).not.toContain("onboarding-phone-handoff");
  });
});
