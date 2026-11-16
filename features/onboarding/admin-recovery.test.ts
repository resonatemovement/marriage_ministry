import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./management", () => ({ completeIncompleteProfile: vi.fn(), recoverIncompleteProfile: vi.fn(), uploadAdminProfilePhoto: vi.fn() }));

import { AdminOnboardingRecovery } from "./admin-recovery";

function render(readiness: { verified: boolean; stateEligible: boolean; eligible: boolean; missing: string[] }) {
  return renderToStaticMarkup(createElement(AdminOnboardingRecovery, {
    profileId: "profile",
    firstName: "Avery",
    lastName: "Rivera",
    phone: "+14155550101",
    campusId: "campus",
    email: "avery@example.test",
    missing: readiness.missing,
    readinessVerified: readiness.verified,
    stateEligible: readiness.stateEligible,
    completionEligible: readiness.eligible,
    campuses: [{ id: "campus", name: "Campus", active: true }],
  }));
}

describe("Admin onboarding recovery readiness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows completion only after authoritative eligibility succeeds", () => {
    const html = render({ verified: true, stateEligible: true, eligible: true, missing: [] });
    expect(html).toContain("Onboarding ready to complete");
    expect(html).toContain("Complete onboarding");
    expect(html).not.toContain("Recover onboarding");
  });

  it("lists authoritative missing requirements and withholds completion", () => {
    const html = render({ verified: true, stateEligible: true, eligible: false, missing: ["phone", "profile photo"] });
    expect(html).toContain("Missing: phone, profile photo");
    expect(html).toContain("Recover onboarding");
    expect(html).not.toContain(">Complete onboarding</button>");
  });

  it("fails closed if readiness cannot be verified", () => {
    const html = render({ verified: false, stateEligible: false, eligible: false, missing: [] });
    expect(html).toContain("Unable to verify onboarding readiness");
    expect(html).not.toContain("Complete onboarding</button>");
    expect(html).not.toContain("Recover onboarding");
  });

  it("does not offer recovery for a profile outside the onboarding state", () => {
    const html = render({ verified: true, stateEligible: false, eligible: false, missing: ["onboarding status"] });
    expect(html).toContain("Missing: onboarding status");
    expect(html).not.toContain("Complete onboarding</button>");
    expect(html).not.toContain("Recover onboarding");
  });
});
