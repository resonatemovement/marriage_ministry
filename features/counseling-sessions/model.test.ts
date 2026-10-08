import { describe, expect, it } from "vitest";
import { canManageSessions, sessionCardState } from "./model";

const sessions = [{ id: "one", number: 1, title: "Foundations" }, { id: "two", number: 2, title: "Communication" }];
const initial = { id: "i", sessionId: null, startsAt: "2026-10-02T18:00:00Z", endsAt: "2026-10-02T19:00:00Z", location: "Church" };
const one = { ...initial, id: "one-meeting", sessionId: "one" };
describe("counseling Sessions card state", () => {
  it("presents initial meeting scheduling and rescheduling", () => { expect(sessionCardState("matched", sessions, [], [])).toMatchObject({ label: "INITIAL MEETING", action: "schedule-initial" }); expect(sessionCardState("matched", sessions, [initial], [])).toMatchObject({ action: "reschedule-initial" }); });
  it("keeps incomplete Homework at reschedule", () => expect(sessionCardState("active", sessions, [one], [{ sessionId: "one", complete: false }]).action).toBe("reschedule-meeting"));
  it("advances only after Homework and closes a completed final Session", () => { expect(sessionCardState("active", sessions, [one], [{ sessionId: "one", complete: true }]).action).toBe("schedule-next"); expect(sessionCardState("active", sessions, [{ ...one, sessionId: "two" }], [{ sessionId: "two", complete: true }]).action).toBe("close-case"); });
  it("does not offer active actions after closure and limits management to care roles", () => { expect(sessionCardState("finished", sessions, [one], []).action).toBeNull(); expect(canManageSessions(["campus_lead"])).toBe(true); expect(canManageSessions(["coach"])).toBe(true); expect(canManageSessions(["counselor"])).toBe(true); expect(canManageSessions(["couple"])).toBe(false); });
});
