import { describe, expect, it } from "vitest";
import { canManageSessions, publishedSessionOptions, sessionCardState } from "./model";

const sessions = [{ id: "one", number: 1, title: "Foundations", isFinal: false }, { id: "two", number: 2, title: "Communication", isFinal: false }];
const initial = { id: "i", sessionId: null, caseSessionId: null, startsAt: "2026-10-02T18:00:00Z", endsAt: "2026-10-02T19:00:00Z", location: "Church", completedAt: null, createdAt: "2026-10-01T10:00:00Z" };
const caseSession = { id: "case-session-one", sessionId: "one", actualSequence: 1, templateSequence: 1, title: "Foundations", status: "active" as const, isFinal: false, homeworkAssignmentRevisionId: "homework-revision-one", materialReleasedAt: "2026-10-02T19:00:00Z", homeworkReleasedAt: "2026-10-02T19:00:00Z" };
const one = { ...initial, id: "one-meeting", sessionId: "one", caseSessionId: caseSession.id, createdAt: "2026-10-02T10:00:00Z" };
describe("counseling Sessions card state", () => {
  it("represents Session 0 without a template and defaults to the first published Session", () => expect(sessionCardState("matched", sessions, [], [])).toMatchObject({ label: "SESSION 0", detail: "Initial Meeting · Not Scheduled", action: "schedule-initial", nextSession: sessions[0] }));
  it("offers completion and rescheduling after the Initial Meeting is scheduled", () => expect(sessionCardState("matched", sessions, [initial], [])).toMatchObject({ action: "complete-initial", canReschedule: true, meeting: initial }));
  it("uses the assigned authored snapshot independently of the Couple-specific progress order", () => {
    const selectedOutOfOrder = { ...caseSession, sessionId: "two", templateSequence: 2, title: "Communication", actualSequence: 1 };
    expect(sessionCardState("active", sessions, [{ ...one, sessionId: "two" }], [], [selectedOutOfOrder])).toMatchObject({
      label: "SESSION 2",
      session: { number: 2 },
      detail: "Communication",
      action: "complete-session",
      caseSession: selectedOutOfOrder,
      progress: "Session 1 of 2",
    });
  });
  it("ranks all templates before selecting published Session options", () => {
    const options = publishedSessionOptions([
      { id: "draft", sequenceNumber: 1, title: "Draft", status: "draft", isFinal: false },
      { id: "published", sequenceNumber: 10, title: "Published", status: "published", isFinal: true },
    ]);
    expect(options).toEqual([{ id: "published", number: 2, title: "Published", isFinal: true }]);
    expect(options.map(({ number }) => number)).not.toContain(10);
  });
  it("projects raw template keys 1 and 10 as authored Sessions 1 and 2", () => {
    expect(publishedSessionOptions([
      { id: "testing", sequenceNumber: 1, title: "testing", status: "published", isFinal: false },
      { id: "new", sequenceNumber: 10, title: "new session", status: "published", isFinal: false },
    ]).map(({ number, title }) => `Session ${number}: ${title}`)).toEqual([
      "Session 1: testing",
      "Session 2: new session",
    ]);
  });
  it("selects the newest uncompleted Meeting and retains completed Meeting history on the same Session", () => {
    const prior = { ...one, id: "meeting-one", completedAt: "2026-10-02T19:00:00Z", createdAt: "2026-10-02T10:00:00Z" };
    const followup = { ...one, id: "meeting-two", startsAt: "2026-10-09T18:00:00Z", createdAt: "2026-10-03T10:00:00Z" };
    const state = sessionCardState("active", sessions, [prior, followup], [], [caseSession]);
    expect(state.meeting).toEqual(followup);
    expect(state.pastMeetings).toEqual([prior]);
    expect(state.caseSession).toBe(caseSession);
    expect(state.caseSession?.actualSequence).toBe(1);
  });
  it("offers completion for an active Session and retains case closure semantics", () => { expect(sessionCardState("active", sessions, [one], [{ sessionId: "one", complete: true }], [caseSession]).action).toBe("complete-session"); expect(sessionCardState("finished", sessions, [one], [], [caseSession]).action).toBeNull(); expect(canManageSessions(["campus_lead"])).toBe(true); expect(canManageSessions(["coach"])).toBe(true); expect(canManageSessions(["counselor"])).toBe(true); expect(canManageSessions(["couple"])).toBe(false); });
  it("preserves explicit final designation on the assigned Session snapshot", () => {
    expect(sessionCardState("active", sessions, [one], [], [{ ...caseSession, isFinal: true }]).caseSession?.isFinal).toBe(true);
    expect(sessionCardState("active", sessions, [one], [], [caseSession]).caseSession?.isFinal).toBe(false);
  });
  it("keeps a no-Homework active Session in the case journey", () => {
    const noHomework = { ...caseSession, homeworkAssignmentRevisionId: null, homeworkReleasedAt: null };
    expect(sessionCardState("active", sessions, [one], [], [noHomework])).toMatchObject({ kind: "session", caseSession: noHomework, action: "complete-session" });
  });
  it("renders successful and incomplete terminal states without lifecycle actions", () => {
    expect(sessionCardState("finished", sessions, [one], [], [caseSession])).toMatchObject({ kind: "completed", label: "COMPLETED", action: null, meeting: null });
    expect(sessionCardState("inactive", sessions, [one], [], [caseSession])).toMatchObject({ kind: "closed", label: "CLOSED — INCOMPLETE", action: null, meeting: null });
  });
});
