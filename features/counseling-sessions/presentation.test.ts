import { describe, expect, it } from "vitest";
import { sessionCardState } from "./model";
import { counselingSessionPresentation, counselingSessionsGridClassName, couplePhotoSlots, sessionCardActionClassName, sessionCardNavigation, sessionCardNavigationClassName } from "./presentation";

const sessions = [{ id: "one", number: 1, title: "Foundations" }, { id: "two", number: 2, title: "Communication" }];
const meeting = { id: "meeting", sessionId: "two", startsAt: "2026-10-12T19:00:00Z", endsAt: "2026-10-12T20:00:00Z", location: "Church" };

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

  it("provides an accessible counseling-case destination while keeping primary actions above the card link", () => {
    expect(sessionCardNavigation("case-1", "Anthony Jones & Amy Lee")).toEqual({ href: "/workspace/cases/case-1", label: "Open counseling case for Anthony Jones & Amy Lee" });
    expect(sessionCardNavigationClassName).toContain("focus-visible:bg-info-soft/45");
    expect(sessionCardNavigationClassName).toContain("z-0");
    expect(sessionCardActionClassName).toContain("z-10");
  });

  it("keeps Initial Meeting state and action presentation intact", () => {
    const state = sessionCardState("matched", sessions, [], []);
    expect(counselingSessionPresentation(state)).toMatchObject({ statusLabel: "INITIAL MEETING", sessionTitle: "Not Scheduled", homework: null, action: "schedule-initial", progress: "0 of 2 Sessions" });
  });

  it("keeps Session, homework, meeting, progress, and primary-action content available", () => {
    const state = sessionCardState("active", sessions, [meeting], [{ sessionId: "two", complete: false }]);
    expect(counselingSessionPresentation(state)).toMatchObject({ statusLabel: "SESSION 2", sessionTitle: "Communication", homework: "Awaiting Completion", action: "reschedule-meeting", progress: "2 of 2 Sessions" });
    expect(state.meeting?.startsAt).toBe(meeting.startsAt);
  });

  it("presents the current Session, incomplete Homework, meeting, and unchanged reschedule action", () => {
    const state = sessionCardState("active", sessions, [meeting], [{ sessionId: "two", complete: false }]);
    expect(counselingSessionPresentation(state)).toMatchObject({ statusLabel: "SESSION 2", sessionTitle: "Communication", homework: "Awaiting Completion", action: "reschedule-meeting", progress: "2 of 2 Sessions" });
    expect(state.meeting).toEqual(meeting);
  });

  it("presents a completed final Session as Close Case and never Schedule Next Meeting", () => {
    const state = sessionCardState("active", sessions, [meeting], [{ sessionId: "two", complete: true }]);
    expect(counselingSessionPresentation(state)).toMatchObject({ statusLabel: "FINAL SESSION", sessionTitle: "Communication", homework: "Completed", action: "close-case", progress: "2 of 2 Sessions" });
    expect(state.action).not.toBe("schedule-next");
  });
});
