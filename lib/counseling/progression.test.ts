import { describe, expect, it } from "vitest";

import { coupleOnboardingStatus, coupleProgressionStage, currentCounselingSessionKey, MINISTRY_PROGRESSION_STAGES } from "./progression";

describe("Dashboard counseling progression", () => {
  it("keeps the approved progression stages and separate outcomes", () => {
    expect(MINISTRY_PROGRESSION_STAGES.map(({ id }) => id)).toEqual([
      "intake", "onboarding", "awaiting_assignment", "counseling", "completed", "referred", "closed_incomplete",
    ]);
  });

  it("uses partner onboarding records and invitation-created missing members", () => {
    expect(coupleOnboardingStatus([true, true], 2)).toBe("complete");
    expect(coupleOnboardingStatus([true, false], 2)).toBe("incomplete");
    expect(coupleOnboardingStatus([], 2)).toBe("incomplete");
    expect(coupleOnboardingStatus([], 0)).toBe("unknown");
    expect(coupleOnboardingStatus([true, true, true], 3)).toBe("unknown");
  });

  it("assigns each Couple to one stage and leaves ambiguous records unclassified", () => {
    expect(coupleProgressionStage({ caseStatus: null, hasCounselorOfRecord: false, onboarding: "incomplete" })).toBe("onboarding");
    expect(coupleProgressionStage({ caseStatus: "interviewed", hasCounselorOfRecord: false, onboarding: "complete" })).toBe("awaiting_assignment");
    expect(coupleProgressionStage({ caseStatus: "matched", hasCounselorOfRecord: true, onboarding: "complete" })).toBe("counseling");
    expect(coupleProgressionStage({ caseStatus: "finished", hasCounselorOfRecord: true, onboarding: "complete" })).toBe("completed");
    expect(coupleProgressionStage({ caseStatus: "referred", hasCounselorOfRecord: false, onboarding: "unknown" })).toBe("referred");
    expect(coupleProgressionStage({ caseStatus: "inactive", hasCounselorOfRecord: false, onboarding: "unknown" })).toBe("closed_incomplete");
    expect(coupleProgressionStage({ caseStatus: "active", hasCounselorOfRecord: true, onboarding: "incomplete" })).toBeNull();
    expect(coupleProgressionStage({ caseStatus: "interviewed", hasCounselorOfRecord: true, onboarding: "complete" })).toBeNull();
    expect(coupleProgressionStage({ caseStatus: null, hasCounselorOfRecord: false, onboarding: "unknown" })).toBeNull();
  });

  it("counts Initial Meeting only for assigned Couple progress before an active Session", () => {
    const published = new Set(["session-1", "session-2"]);
    expect(currentCounselingSessionKey({ caseStatus: "matched", hasCounselorOfRecord: true, activeSessionId: null, publishedSessionIds: published })).toBe("initial");
    expect(currentCounselingSessionKey({ caseStatus: "active", hasCounselorOfRecord: true, activeSessionId: "session-2", publishedSessionIds: published })).toBe("session-2");
    expect(currentCounselingSessionKey({ caseStatus: "active", hasCounselorOfRecord: false, activeSessionId: "session-1", publishedSessionIds: published })).toBeNull();
    expect(currentCounselingSessionKey({ caseStatus: "finished", hasCounselorOfRecord: true, activeSessionId: null, publishedSessionIds: published })).toBeNull();
    expect(currentCounselingSessionKey({ caseStatus: "active", hasCounselorOfRecord: true, activeSessionId: "archived-session", publishedSessionIds: published })).toBeNull();
  });
});
