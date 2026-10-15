import { describe, expect, it } from "vitest";
import { sessionCardState } from "./model";
import { counselingProgressPercent, counselingSessionPresentation, counselingSessionsGridClassName, couplePhotoSlots, sessionCardNavigation, sessionCardNavigationClassName } from "./presentation";

const sessions = [{ id: "one", number: 1, title: "Foundations", isFinal: false }, { id: "two", number: 2, title: "Communication", isFinal: false }];
const meeting = { id: "meeting", sessionId: "two", caseSessionId: "couple-session", startsAt: "2026-10-12T19:00:00Z", endsAt: "2026-10-12T20:00:00Z", location: "Church", completedAt: null, createdAt: "2026-10-10T10:00:00Z" };
const active = { id: "couple-session", sessionId: "two", actualSequence: 1, templateSequence: 2, title: "Communication", status: "active" as const, isFinal: false, homeworkAssignmentRevisionId: "homework-revision", materialReleasedAt: "2026-10-10T00:00:00Z", homeworkReleasedAt: "2026-10-10T00:00:00Z" };

describe("Counseling Sessions card presentation", () => {
  it("uses a responsive grid with no more than two columns", () => {
    expect(counselingSessionsGridClassName).toContain("grid-cols-1");
    expect(counselingSessionsGridClassName).toContain("sm:grid-cols-2");
    expect(counselingSessionsGridClassName).not.toContain("grid-cols-3");
  });

  it("represents two partner photos and preserves a fallback slot when a photo is missing", () => {
    const partners = [{ id: "a", name: "Anthony Jones", photoUrl: "/anthony.jpg" }, { id: "b", name: "Amy Lee", photoUrl: null }];
    expect(couplePhotoSlots(partners)).toEqual(partners);
    expect(couplePhotoSlots(partners)[1]?.photoUrl).toBeNull();
    expect(couplePhotoSlots(partners.slice(0, 1))).toHaveLength(2);
    expect(couplePhotoSlots(partners.slice(0, 1))[1]).toBeNull();
  });

  it("provides an accessible counseling-case destination", () => {
    expect(sessionCardNavigation("case-1", "Anthony Jones & Amy Lee")).toEqual({ href: "/workspace/cases/case-1", label: "Open counseling case for Anthony Jones & Amy Lee" });
    expect(sessionCardNavigationClassName).toContain("focus-visible:bg-info-soft/45");
    expect(sessionCardNavigationClassName).toContain("z-0");
  });

  it("keeps Initial Meeting state and action presentation intact", () => {
    const state = sessionCardState("matched", sessions, [], []);
    expect(counselingSessionPresentation(state)).toMatchObject({ statusLabel: "SESSION 0", sessionTitle: "Initial Meeting · Not Scheduled", homework: null, action: "schedule-initial", progress: "Session 0 of 2" });
  });

  it("keeps Session, homework, meeting, progress, and primary-action content available", () => {
    const state = sessionCardState("active", sessions, [meeting], [{ sessionId: "two", complete: false }], [active]);
    expect(counselingSessionPresentation(state)).toMatchObject({ statusLabel: "SESSION 2", sessionTitle: "Communication", homework: "Released", action: "complete-session", progress: "Session 1 of 2" });
    expect(state.meeting?.startsAt).toBe(meeting.startsAt);
  });

  it("presents the active Session completion action while retaining its meeting", () => {
    const state = sessionCardState("active", sessions, [meeting], [{ sessionId: "two", complete: false }], [active]);
    expect(counselingSessionPresentation(state)).toMatchObject({ statusLabel: "SESSION 2", sessionTitle: "Communication", homework: "Released", action: "complete-session", progress: "Session 1 of 2" });
    expect(state.meeting).toEqual(meeting);
  });

  it("keeps case closure separate from Session progression", () => {
    const state = sessionCardState("active", sessions, [meeting], [{ sessionId: "two", complete: true }], [active]);
    expect(counselingSessionPresentation(state)).toMatchObject({ statusLabel: "SESSION 2", sessionTitle: "Communication", homework: "Released", action: "complete-session" });
  });

  it("derives the displayed progress bar from the unchanged X of Y label", () => {
    expect(counselingProgressPercent("Session 1 of 6", false)).toBeCloseTo(100 / 6);
    expect(counselingProgressPercent("Session 0 of 6", false)).toBe(0);
    expect(counselingProgressPercent("Session 2 of 2", false)).toBe(100);
    expect(counselingProgressPercent("6 Sessions", true)).toBe(100);
    expect(counselingProgressPercent("3 Sessions", false)).toBeNull();
  });
});
