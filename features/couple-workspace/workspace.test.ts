import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));
vi.mock("@/features/counseling-sessions/meeting-realtime", () => ({ MeetingRealtime: ({ caseId }: { caseId: string }) => createElement("i", { "data-meeting-case": caseId }) }));
vi.mock("@/features/counseling-sessions/case-lifecycle-realtime", () => ({ CaseLifecycleRealtime: ({ caseId }: { caseId: string }) => createElement("i", { "data-lifecycle-case": caseId }) }));
vi.mock("@/features/counseling-sessions/homework-progress-realtime", () => ({ HomeworkProgressRealtime: ({ assignmentRevisionId }: { assignmentRevisionId: string }) => createElement("i", { "data-homework-revision": assignmentRevisionId }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/notifications/in-app-actions", () => ({ markInAppNotificationRead: vi.fn() }));

import { CoupleWorkspace } from "./workspace";
import { homeworkProgressBadgeClass } from "@/features/homework/presentation";

const data = {
  caseId: "case-1",
  coupleName: "Alex & Jordan",
  partners: [{ id: "partner-1", name: "Alex", photoUrl: null }, { id: "partner-2", name: "Jordan", photoUrl: null }],
  status: "active", completed: false, totalSessions: 3,
  team: { counselor: { caseId: "case-1", id: "counselor-team", name: "Counselor Team" } },
  currentSession: { id: "session-1", caseSessionId: "case-session-1", number: 2, actualSequence: 1, title: "Connection" },
  homeworkRequired: true,
  homeworkRevisionId: "homework-revision",
  initialMeeting: null, nextMeeting: { startsAt: "2026-10-10T18:00:00.000Z", location: "Fremont" },
  homework: { title: "Listening practice", status: "not_started" as const },
};
const formattedMeeting = (startsAt: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(startsAt));

describe("CoupleWorkspace", () => {
  it("replaces the four overview cards with one completed-program review card", () => {
    const html = renderToStaticMarkup(createElement(CoupleWorkspace, {
      data: { ...data, status: "finished", completed: true, currentSession: null, homework: null, nextMeeting: null },
      prepareEnrich: null,
    }));
    expect(html).toContain("Congratulations! You&#x27;ve Completed the Program!");
    expect(html).toContain("You&#x27;ve completed your counseling journey with Resonate.");
    expect(html).toContain("Your Session Material and completed Homework will remain available whenever you&#x27;d like to revisit them.");
    expect(html).toContain('href="/workspace/sessions"');
    expect(html).toContain("Review Session Material");
    expect(html).not.toContain(">Current Session</p>");
    expect(html).not.toContain(">Homework</p>");
    expect(html).not.toContain(">Next Meeting</p>");
    expect(html).not.toContain(">Counseling Progress</p>");
    const rail = html.slice(html.indexOf("<aside"), html.indexOf("</aside>"));
    expect(rail).toContain("Counseling Status");
    expect(rail).toContain("Completed");
    expect(rail).toContain("Counseling Team");
    expect(rail).toContain("Prepare &amp; Enrich");
  });

  it("does not apply the completed-program card to a Closed — Incomplete case", () => {
    const html = renderToStaticMarkup(createElement(CoupleWorkspace, {
      data: { ...data, status: "inactive", completed: false, currentSession: null, homework: null, nextMeeting: null },
      prepareEnrich: null,
    }));
    expect(html).not.toContain("Congratulations!");
    expect(html).toContain(">Current Session</p>");
    expect(html).toContain(">Homework</p>");
    expect(html).toContain(">Next Meeting</p>");
    expect(html).toContain(">Counseling Progress</p>");
  });

  it("shows an overview with Current Session and Homework navigation without rendering the reader or form", () => {
    const html = renderToStaticMarkup(createElement(CoupleWorkspace, { data, prepareEnrich: null }));
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('href="/workspace"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]"');
    expect(html).toContain('class="space-y-6"');
    expect(html).toContain('rounded-lg border border-black/[0.04] bg-surface');
    expect(html.indexOf("Couple Workspace")).toBeLessThan(html.indexOf("Alex &amp; Jordan"));
    expect(html.indexOf("Alex &amp; Jordan")).toBeLessThan(html.indexOf("Counseling Status"));
    expect(html).toContain("Session 2: Connection");
    expect(html).toContain("Session 1 of 3");
    expect(html).toContain("Open Session");
    expect(html).toContain('href="/workspace/sessions/case-session-1"');
    expect(html).toContain(">Homework</h2>");
    expect(html).toContain(`${homeworkProgressBadgeClass("not_started")}">Not Started</span>`);
    expect(html).not.toContain("Homework · Not Started");
    expect(html).toContain('href="/workspace/sessions/case-session-1?tab=homework"');
    expect(html).toContain("Next Meeting");
    expect(html).toContain('data-meeting-case="case-1"');
    expect(html).toContain('data-lifecycle-case="case-1"');
    expect(html).toContain(formattedMeeting(data.nextMeeting.startsAt));
    expect(html).toContain("Counseling Progress");
    expect(html).toContain('class="grid items-stretch gap-4 sm:grid-cols-2"');
    expect(html.match(/h-full p-5/g)).toHaveLength(4);
    expect(html).toContain("-space-x-3");
    expect(html.match(/border-2 border-white/g)).toHaveLength(2);
    expect(html).toContain("Not Started");
    expect(html).toContain("Private to you");
    expect(html).not.toContain("Continue Homework");
    expect(html).not.toContain("Session Material Page");
    expect(html).not.toContain("Your response");
    expect(html.indexOf("Current Session")).toBeLessThan(html.indexOf("Homework"));
    expect(html.indexOf("Homework")).toBeLessThan(html.indexOf("Next Meeting"));
    expect(html.indexOf("Next Meeting")).toBeLessThan(html.indexOf("Counseling Progress"));
    const rail = html.slice(html.indexOf("<aside"), html.indexOf("</aside>"));
    expect(rail.indexOf("Counseling Status")).toBeLessThan(rail.indexOf("Counseling Team"));
    expect(rail.indexOf("Counseling Team")).toBeLessThan(rail.indexOf("Prepare &amp; Enrich"));
    expect(rail).not.toContain("Next Step");
    expect(html).not.toContain("Schedule");
    expect(html).not.toContain("Close Case");
    expect(html).toContain('href="/workspace/contacts/case-1/counselor-team"');
    expect(html).toContain(">Counselor Team</a>");
    expect(html).not.toContain("Campus Lead Team");
    expect(html).not.toContain("Coach Team");
  });

  it("keeps Couple Version as the final right-rail card", () => {
    const html = renderToStaticMarkup(createElement(CoupleWorkspace, { data, prepareEnrich: { id: "document", slot: "couple", fileName: "couple.pdf", contentType: "application/pdf", sizeBytes: 100 } }));
    expect(html).toContain("Couple Version");
    expect(html).not.toContain("Counselor Copy");
    expect(html).toContain('href="/workspace/prepare-enrich"');
    expect(html.indexOf("Counseling Status")).toBeLessThan(html.indexOf("Counseling Team"));
    expect(html.lastIndexOf("Prepare &amp; Enrich")).toBeGreaterThan(html.lastIndexOf("Counseling Team"));
    expect(html.lastIndexOf("Prepare &amp; Enrich")).toBe(html.indexOf("Prepare &amp; Enrich"));
  });

  it("places partner identity in the main-column header card and keeps right rail beside it", () => {
    const html = renderToStaticMarkup(createElement(CoupleWorkspace, { data, prepareEnrich: null }));
    const shellStart = html.indexOf('class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]"');
    const mainColumn = html.slice(shellStart, html.indexOf("<aside", shellStart));
    expect(mainColumn).toContain('class="space-y-6"');
    expect(mainColumn).toContain("p-5 sm:p-7");
    expect(mainColumn).toContain('aria-label="Alex &amp; Jordan partner photos"');
    expect(mainColumn).toContain("Follow your counseling journey, current Session, and next meeting.");
    expect(mainColumn.indexOf("Couple Workspace")).toBeLessThan(mainColumn.indexOf("Current Session"));
  });

  it("uses the Initial Meeting state before a Session is scheduled", () => {
    const html = renderToStaticMarkup(createElement(CoupleWorkspace, { data: { ...data, currentSession: null, homework: null, nextMeeting: { startsAt: "2026-10-10T18:00:00.000Z", location: "Fremont" } }, prepareEnrich: null }));
    expect(html).toContain("Initial Meeting");
    expect(html).toContain("In Progress");
    expect(html).toContain(formattedMeeting(data.nextMeeting.startsAt));
    expect(html).toContain("Homework will appear when your first Session begins.");
    expect(html).not.toContain("Your response");
    expect(html).not.toContain("Status:");
  });

  it("shows a compact no-Homework summary with navigation into the Session Homework tab", () => {
    const html = renderToStaticMarkup(createElement(CoupleWorkspace, {
      data: { ...data, homeworkRequired: false, homework: null },
      prepareEnrich: null,
    }));
    expect(html).toContain("No Homework for this Session");
    expect(html).not.toContain(`${homeworkProgressBadgeClass("not_started")}">Not Started</span>`);
    expect(html).not.toContain(`${homeworkProgressBadgeClass("submitted")}">Submitted</span>`);
    expect(html).toContain('href="/workspace/sessions/case-session-1?tab=homework"');
    expect(html).not.toContain("Your response");
  });

  it.each([
    ["not_started", "Not Started", "bg-surface-muted text-text-muted"],
    ["in_progress", "In Progress", "bg-info-soft text-info-strong"],
    ["submitted", "Submitted", "bg-success-soft text-success-strong"],
    ["reviewed", "Reviewed", "bg-success-soft text-success-strong"],
  ] as const)("shows %s as a shared status badge beside Homework", (status, label, badgeClass) => {
    const html = renderToStaticMarkup(createElement(CoupleWorkspace, {
      data: { ...data, homework: { status } },
      prepareEnrich: null,
    }));
    expect(html).toContain(`<h2 class="font-heading text-base font-bold text-text-primary">Homework</h2><span class="inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass}">${label}</span>`);
    expect(html).not.toContain(`Homework · ${label}`);
  });

  it("shows a rescheduled authored follow-up Meeting with its location only once", () => {
    const startsAt = "2026-10-15T18:30:00.000Z";
    const html = renderToStaticMarkup(createElement(CoupleWorkspace, {
      data: { ...data, nextMeeting: { startsAt, location: "In person" } },
      prepareEnrich: null,
    }));
    expect(html).toContain(`${formattedMeeting(startsAt)} · In person`);
    expect(html.match(/In person/g)).toHaveLength(1);
    expect(html).not.toContain("Oct 10, 2026");
  });

  it("labels the Couple's current position as a Session count without implying completion", () => {
    const html = renderToStaticMarkup(createElement(CoupleWorkspace, {
      data: { ...data, totalSessions: 2, currentSession: { ...data.currentSession!, number: 2, actualSequence: 2 } },
      prepareEnrich: null,
    }));
    expect(html).toContain("Session 2 of 2");
    expect(html).not.toContain("2 of 2 Sessions");
    expect(html).toContain('style="width:100%"');
    expect(html).toContain(">Current</span>");
    expect(html).not.toContain("Counseling journey complete");
  });
});
