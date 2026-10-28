import { createElement, type ImgHTMLAttributes, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: ({ unoptimized, ...props }: Record<string, unknown>) => { void unoptimized; return createElement("img", props as ImgHTMLAttributes<HTMLImageElement>); } }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => createElement("a", props, children) }));
vi.mock("./actions", () => ({ scheduleInitialMeeting: vi.fn(), completeInitialMeeting: vi.fn(), completeSessionScheduleNext: vi.fn(), completeCounselingProgram: vi.fn(), closeCounselingCaseIncomplete: vi.fn(), scheduleFollowupMeeting: vi.fn(), rescheduleSessionMeeting: vi.fn(), resetCounselingJourney: vi.fn() }));
vi.mock("./homework-progress-realtime", () => ({ HomeworkProgressRealtime: ({ assignmentRevisionId }: { assignmentRevisionId: string }) => createElement("i", { "data-homework-revision": assignmentRevisionId }) }));
vi.mock("./meeting-realtime", () => ({ MeetingRealtime: ({ caseId }: { caseId: string }) => createElement("i", { "data-meeting-case": caseId }) }));
vi.mock("./case-lifecycle-realtime", () => ({ CaseLifecycleRealtime: ({ caseId }: { caseId: string }) => createElement("i", { "data-lifecycle-case": caseId }) }));
vi.mock("./meeting-notification-realtime", () => ({ MeetingNotificationRealtime: ({ meetingId }: { meetingId: string }) => createElement("i", { "data-notification-meeting": meetingId }) }));
vi.mock("@/features/session-materials-export/export-session-materials-button", () => ({ ExportSessionMaterialsButton: ({ caseSessionId }: { caseSessionId: string }) => createElement("div", { "data-export-session": caseSessionId }, createElement("button", null, "Preview PDF"), createElement("button", null, "Download PDF")) }));

import { CounselingCoupleDetailPage } from "./couple-detail-page";
import type { CounselingSessionCard } from "./queries";

const card: CounselingSessionCard = {
  caseId: "case-1", coupleId: "couple-1", coupleName: "Anthony Jones & Amy Lee", status: "active",
  partners: [{ id: "anthony", firstName: "Anthony", name: "Anthony Jones", photoUrl: "https://example.test/anthony.avif" }, { id: "amy", firstName: "Amy", name: "Amy Lee", photoUrl: null }],
  state: { kind: "session", label: "SESSION 2", detail: "Communication", action: "complete-session", canReschedule: true, session: { id: "session-2", number: 2, title: "Communication", isFinal: false }, caseSession: { id: "case-session", sessionId: "session-2", actualSequence: 2, templateSequence: 2, title: "Communication", status: "active", isFinal: false, homeworkAssignmentRevisionId: "homework-revision", materialReleasedAt: "2026-10-10T00:00:00Z", homeworkReleasedAt: "2026-10-10T00:00:00Z" }, nextSession: { id: "session-3", number: 3, title: "Trust", isFinal: false }, meeting: { id: "meeting", sessionId: "session-2", caseSessionId: "case-session", startsAt: "2026-10-12T19:00:00Z", endsAt: "2026-10-12T20:00:00Z", location: "Church", completedAt: null, createdAt: "2026-10-11T10:00:00Z" }, pastMeetings: [{ id: "meeting-one", sessionId: "session-2", caseSessionId: "case-session", startsAt: "2026-10-05T19:00:00Z", endsAt: "2026-10-05T20:00:00Z", location: "Church", completedAt: "2026-10-05T20:00:00Z", createdAt: "2026-10-04T10:00:00Z" }], progress: "Session 2 of 6" },
  publishedSessions: [{ id: "session-1", number: 1, title: "Foundations", isFinal: false }, { id: "session-2", number: 2, title: "Communication", isFinal: false }],
  team: { campusLead: { id: "lead-team", name: "Davis & Morgan" }, coach: { id: "coach-team", name: "James & Gina Jacobs" }, counselor: { id: "counselor-team", name: "Taylor & Jordan Reed" } },
  homework: { title: "Session 2 Homework", complete: false, partners: [{ progressId: "progress-anthony", profileId: "anthony", name: "Anthony Jones", status: "submitted" }, { progressId: "progress-amy", profileId: "amy", name: "Amy Lee", status: "in_progress" }] },
  materialSessions: [{ id: "case-session", title: "Communication", actualSequence: 2, templateSequence: 2, status: "active" }],
};

describe("Counseling couple detail foundation", () => {
  it("shows the couple, partner photo fallback, current Session, status, and meeting", () => {
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card }));
    expect(markup).toContain("Anthony Jones &amp; Amy Lee");
    expect(markup).toContain("Anthony Jones profile");
    expect(markup).toContain("Amy Lee profile placeholder");
    expect(markup).toContain("-space-x-3");
    expect(markup.match(/border-2 border-white/g)).toHaveLength(2);
    expect(markup).toContain("Communication");
    expect(markup).toContain("In Progress");
    expect(markup).toContain("Oct 12, 2026");
    expect(markup).toContain("Schedule Next Session");
    expect(markup).toContain("Current Session");
    expect(markup).toContain("Session 2");
    expect(markup).toContain("Upcoming Meeting");
    expect(markup).toContain(">Current</span>");
    expect(markup).not.toContain("Upcoming</span>");
    expect(markup).toContain("Church");
    expect(markup).toContain("Meeting 1 · Completed");
    expect(markup).toContain("Session 2 of 6");
    expect(markup).toContain('data-meeting-case="case-1"');
    expect(markup).toContain('data-lifecycle-case="case-1"');
    expect(markup).toContain("Preview PDF");
    expect(markup).toContain("Download PDF");
  });

  it("uses the Schedule Next Session label for Session 0 while retaining its existing completion flow", () => {
    const session0: CounselingSessionCard = {
      ...card,
      state: {
        ...card.state,
        kind: "initial",
        label: "SESSION 0",
        detail: "Initial Meeting",
        action: "complete-initial",
        session: null,
        caseSession: null,
        nextSession: card.publishedSessions[0],
        meeting: { ...card.state.meeting!, sessionId: null, caseSessionId: null },
        pastMeetings: [],
      },
    };
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card: session0 }));
    expect(markup).toContain("Schedule Next Session");
    expect(markup).toContain("Complete the initial meeting and schedule the couple’s first counseling session.");
    expect(markup).toContain("In Progress");
  });

  it("keeps a normal Session schedulable when it has no eligible published next Session", () => {
    const finalSequenceNormal = { ...card, state: { ...card.state, nextSession: null }, publishedSessions: [] };
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card: finalSequenceNormal }));
    expect(markup).toContain("Schedule Next Session");
    expect(markup).not.toContain("Complete Program");
    expect(markup).not.toContain("No eligible published next Session");
  });

  it("shows Complete Program only for an explicitly final authored Session", () => {
    const finalSession = { ...card, state: { ...card.state, caseSession: { ...card.state.caseSession!, isFinal: true }, nextSession: null }, publishedSessions: [] };
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card: finalSession }));
    expect(markup).toContain("Complete Program");
    expect(markup).not.toContain("Schedule Next Session");
  });

  it("keeps DEV Testing hidden unless the server grants the Super Admin DEV capability", () => {
    const ordinary = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card }));
    const devSuperAdmin = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card, canResetCounselingJourney: true }));
    expect(ordinary).not.toContain("DEV Testing");
    expect(devSuperAdmin).toContain("DEV Testing");
    expect(devSuperAdmin).toContain("Reset Counseling Journey");
    expect(devSuperAdmin.indexOf("DEV Testing")).toBeGreaterThan(devSuperAdmin.indexOf("</aside></section>"));
  });

  it("shows compact Homework status by partner first name without response content", () => {
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card }));
    expect(markup).toContain(">Homework</p>");
    expect(markup).toContain('text-brand-secondary">Homework</p>');
    expect(markup).toContain("Session 2 Homework");
    expect(markup).toContain(">Anthony</p>");
    expect(markup).toContain("Submitted");
    expect(markup).toContain('href="/workspace/cases/case-1/homework/progress-anthony"');
    expect(markup).toContain("View Answers");
    expect(markup).not.toContain('href="/workspace/cases/case-1/homework/progress-amy"');
    expect(markup).toContain(">Amy</p>");
    expect(markup).toContain("In Progress");
    expect(markup).not.toContain("homework response");
    expect(markup.indexOf("Upcoming Meeting")).toBeLessThan(markup.indexOf(">Homework</p>"));
    expect(markup).not.toContain("Current Homework");
    expect(markup).toContain('data-homework-revision="homework-revision"');
  });

  it("shows both Not Started statuses from the active pinned revision and keeps partner rows scoped", () => {
    const notStarted = {
      ...card,
      homework: {
        title: "Session 2 Homework",
        complete: false,
        partners: [
          { progressId: "progress-anthony", profileId: "anthony", name: "Anthony Jones", status: "not_started" as const },
          { progressId: "progress-amy", profileId: "amy", name: "Amy Lee", status: "not_started" as const },
        ],
      },
    };
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card: notStarted }));

    expect(markup).toContain('data-homework-revision="homework-revision"');
    expect(markup.match(/>Not Started<\/span>/g)).toHaveLength(2);
    expect(markup).toContain(">Anthony</p>");
    expect(markup).toContain(">Amy</p>");
    expect(markup).not.toContain("Homework status unavailable.");
  });

  it.each([
    ["not_started", "Not Started", "bg-surface-muted text-text-muted"],
    ["in_progress", "In Progress", "bg-info-soft text-info-strong"],
    ["submitted", "Submitted", "bg-success-soft text-success-strong"],
    ["reviewed", "Reviewed", "bg-success-soft text-success-strong"],
  ] as const)("renders counselor Homework status %s with the shared badge treatment", (status, label, badgeClasses) => {
    const homeworkCard = { ...card, homework: { ...card.homework!, partners: card.homework!.partners.map((partner, index) => index === 0 ? { ...partner, status } : partner) } };
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card: homeworkCard }));
    expect(markup).toContain(`${badgeClasses}">${label}</span>`);
  });

  it("uses definitive no-Homework wording for an assigned Session snapshot with no Homework", () => {
    const noHomework = { ...card, state: { ...card.state, caseSession: { ...card.state.caseSession!, homeworkAssignmentRevisionId: null, homeworkReleasedAt: null } }, homework: null };
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card: noHomework }));
    expect(markup).toContain("No Homework for this Session");
    expect(markup).not.toContain("Not Started");
    expect(markup).not.toContain("data-homework-revision");
  });

  it("does not call missing assigned Homework a definitive no-Homework state", () => {
    const unavailable = { ...card, homework: null };
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card: unavailable }));
    expect(markup).toContain("Homework status unavailable.");
    expect(markup).not.toContain("No Homework for this Session");
  });

  it("does not mount live Homework invalidation for a completed Session", () => {
    const completed = { ...card, state: { ...card.state, caseSession: { ...card.state.caseSession!, status: "completed" as const } } };
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card: completed }));
    expect(markup).not.toContain("data-homework-revision");
  });

  it("uses the shared breadcrumb components for Workspace, Sessions, and the current couple", () => {
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card }));
    expect(markup).toContain('aria-label="Breadcrumb"');
    expect((markup.match(/href="\/workspace"/g) ?? [])).toHaveLength(2);
    expect(markup).toContain('aria-current="page"');
    expect(markup).not.toContain(`href="/workspace/cases/${card.caseId}"`);
    expect(markup).not.toContain('role="link"');
    expect(markup).not.toContain('aria-disabled="true"');
  });

  it("shows only the shared Counselor Copy when a Prepare & Enrich document is available", () => {
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, {
      card,
      prepareEnrich: { id: "document-1", slot: "counselor", fileName: "counselor-report.pdf", contentType: "application/pdf", sizeBytes: 12 },
    }));
    expect(markup).toContain("Prepare &amp; Enrich");
    expect(markup).toContain("Counselor Copy");
    expect(markup).toContain("counselor-report.pdf");
    expect(markup).toContain(`/workspace/cases/${card.caseId}/prepare-enrich`);
    expect(markup).not.toContain("Couple Version");
    expect(markup).not.toContain("Upload");
    expect(markup).not.toContain("Replace");
  });

  it("keeps the four right-rail cards in order and consolidates Session work in the main card", () => {
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, {
      card,
      prepareEnrich: { id: "document-1", slot: "counselor", fileName: "counselor-report.pdf", contentType: "application/pdf", sizeBytes: 12 },
    }));
    expect(markup.indexOf("Counseling Status")).toBeLessThan(markup.indexOf("Prepare &amp; Enrich"));
    expect(markup.indexOf("Prepare &amp; Enrich")).toBeLessThan(markup.indexOf("Next Step"));
    expect(markup.indexOf("Next Step")).toBeLessThan(markup.indexOf(">Progress</p>"));
    expect(markup).toContain('aria-label="Next Step"');
    expect(markup).not.toContain("Complete Session &amp; Schedule Next");
    expect(markup).not.toContain("Counseling Team");
    expect(markup).not.toContain(`href="/workspace/contacts/${card.caseId}/lead-team"`);
    expect(markup).not.toContain(`href="/workspace/contacts/${card.caseId}/coach-team"`);
    expect(markup).not.toContain(`href="/workspace/contacts/${card.caseId}/counselor-team"`);
    expect(markup).toContain("Current Session");
    expect(markup).toContain("Upcoming Meeting");
    expect(markup).toContain("Meeting invites");
    expect(markup).toContain("Homework");
    expect(markup).not.toContain("Current Homework");
    expect(markup).toContain("lg:grid-cols-[minmax(0,1fr)_17rem]");
    const mainColumn = markup.slice(markup.indexOf('class="space-y-6"'), markup.indexOf("<aside"));
    expect(mainColumn).toContain("Session 2");
    expect(mainColumn.indexOf("Upcoming Meeting")).toBeLessThan(mainColumn.indexOf(">Homework</p>"));
    expect(mainColumn.indexOf(">Homework</p>")).toBeLessThan(mainColumn.indexOf("Meeting invites"));
    expect(mainColumn).toContain("bg-info-soft/70");
    expect(mainColumn.match(/>Current Session<\/p>/g) ?? []).toHaveLength(1);
    expect(mainColumn).toContain("Session 2</h2>");
    expect(mainColumn).not.toContain("grid items-stretch gap-4 sm:grid-cols-2");
    expect(mainColumn).not.toContain(">Current Homework</p>");
    expect(mainColumn).not.toContain(">Next Meeting</p>");
    expect(markup).toContain("space-y-4");
    const rightRail = markup.slice(markup.indexOf("<aside"), markup.indexOf("</aside>"));
    expect(rightRail).not.toContain("Next Meeting");
    expect(rightRail).toContain("Session 2 of 6");
    expect(rightRail).toContain('role="progressbar"');
    expect(rightRail.indexOf("Counseling Status")).toBeLessThan(rightRail.indexOf("Prepare &amp; Enrich"));
    expect(rightRail.indexOf("Prepare &amp; Enrich")).toBeLessThan(rightRail.indexOf("Next Step"));
    expect(rightRail.indexOf("Next Step")).toBeLessThan(rightRail.indexOf(">Progress</p>"));
    expect(markup).toContain("Oct 12, 2026, 12:00 PM · Church");
  });

  it("keeps Prepare & Enrich directly after Counseling Status when no Counselor Copy is uploaded", () => {
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card }));
    expect(markup.indexOf("Counseling Status")).toBeLessThan(markup.indexOf("Prepare &amp; Enrich"));
    expect(markup).not.toContain("Counseling Team");
    expect(markup).toContain("Counselor Copy");
    expect(markup).toContain("No document uploaded.");
    expect(markup).not.toContain("View / Download");
    expect(markup).not.toContain("Couple Version");
    expect(markup).not.toContain("Upload");
    expect(markup).not.toContain("Replace");
  });
});
