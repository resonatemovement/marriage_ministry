import { createElement, type ImgHTMLAttributes, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: ({ unoptimized, ...props }: Record<string, unknown>) => { void unoptimized; return createElement("img", props as ImgHTMLAttributes<HTMLImageElement>); } }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => createElement("a", props, children) }));

import { CounselingCoupleDetailPage } from "./couple-detail-page";
import type { CounselingSessionCard } from "./queries";

const card: CounselingSessionCard = {
  caseId: "case-1", coupleId: "couple-1", coupleName: "Anthony Jones & Amy Lee", status: "active",
  partners: [{ id: "anthony", name: "Anthony Jones", photoUrl: "https://example.test/anthony.avif" }, { id: "amy", name: "Amy Lee", photoUrl: null }],
  state: { kind: "session", label: "SESSION 2", detail: "Communication", action: "reschedule-meeting", session: { id: "session-2", number: 2, title: "Communication" }, nextSession: null, meeting: { id: "meeting", sessionId: "session-2", startsAt: "2026-10-12T19:00:00Z", endsAt: "2026-10-12T20:00:00Z", location: "Church" }, progress: "2 of 6 Sessions" },
  team: { campusLead: { id: "lead-team", name: "Davis & Morgan" }, coach: { id: "coach-team", name: "James & Gina Jacobs" }, counselor: { id: "counselor-team", name: "Taylor & Jordan Reed" } },
  homework: { title: "Session 2 Homework", partners: [{ profileId: "anthony", name: "Anthony Jones", status: "submitted" }, { profileId: "amy", name: "Amy Lee", status: "in_progress" }] },
};

describe("Counseling couple detail foundation", () => {
  it("shows the couple, partner photo fallback, current Session, status, and meeting", () => {
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card }));
    expect(markup).toContain("Anthony Jones &amp; Amy Lee");
    expect(markup).toContain("Anthony Jones profile");
    expect(markup).toContain("Amy Lee profile placeholder");
    expect(markup).toContain("-space-x-3");
    expect(markup.match(/border-2 border-white/g)).toHaveLength(2);
    expect(markup).toContain("SESSION 2");
    expect(markup).toContain("Communication");
    expect(markup).toContain("In Progress");
    expect(markup).toContain("Oct 12, 2026");
  });

  it("shows current Homework status separately for each partner without response content", () => {
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card }));
    expect(markup).toContain("Current Homework");
    expect(markup).toContain("Session 2 Homework");
    expect(markup).toContain("Anthony Jones");
    expect(markup).toContain("Submitted");
    expect(markup).toContain("Amy Lee");
    expect(markup).toContain("In Progress");
    expect(markup).not.toContain("homework response");
    expect(markup.indexOf("Current Session")).toBeLessThan(markup.indexOf("Current Homework"));
    expect(markup.indexOf("Current Homework")).toBeLessThan(markup.indexOf("Next Meeting"));
    expect(markup).toContain("grid items-stretch gap-4 sm:grid-cols-2");
    expect(markup.match(/h-full p-5/g)).toHaveLength(4);
  });

  it("shows an empty Homework state when none is assigned", () => {
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, { card: { ...card, homework: null } }));
    expect(markup).toContain("No homework assigned yet.");
    expect(markup).not.toContain("Not Started");
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

  it("stacks Counseling Status then Prepare & Enrich without a Counseling Team card", () => {
    const markup = renderToStaticMarkup(createElement(CounselingCoupleDetailPage, {
      card,
      prepareEnrich: { id: "document-1", slot: "counselor", fileName: "counselor-report.pdf", contentType: "application/pdf", sizeBytes: 12 },
    }));
    expect(markup.indexOf("Counseling Status")).toBeLessThan(markup.indexOf("Prepare &amp; Enrich"));
    expect(markup).not.toContain("Counseling Team");
    expect(markup).not.toContain(`href="/workspace/contacts/${card.caseId}/lead-team"`);
    expect(markup).not.toContain(`href="/workspace/contacts/${card.caseId}/coach-team"`);
    expect(markup).not.toContain(`href="/workspace/contacts/${card.caseId}/counselor-team"`);
    expect(markup).toContain("Current Session");
    expect(markup).toContain("Current Homework");
    expect(markup).toContain("lg:grid-cols-[minmax(0,1fr)_17rem]");
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
