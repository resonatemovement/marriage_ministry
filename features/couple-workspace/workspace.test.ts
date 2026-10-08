import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));

import { CoupleWorkspace } from "./workspace";

const data = {
  coupleName: "Alex & Jordan",
  partners: [{ id: "partner-1", name: "Alex", photoUrl: null }, { id: "partner-2", name: "Jordan", photoUrl: null }],
  status: "active", completed: false, totalSessions: 3,
  team: { counselor: { caseId: "case-1", id: "counselor-team", name: "Counselor Team" } },
  currentSession: { id: "session-1", number: 1, title: "Connection", materials: [] },
  initialMeeting: null, nextMeeting: { startsAt: "2026-10-10T18:00:00.000Z", location: "Fremont" },
  homework: { title: "Listening practice", status: "not_started" as const },
};

describe("CoupleWorkspace", () => {
  it("shows the four cards in mobile order using the Counseling Team two-column grid", () => {
    const html = renderToStaticMarkup(createElement(CoupleWorkspace, { data, prepareEnrich: null }));
    expect(html).toContain("Session 1: Connection");
    expect(html).toContain("Your Homework");
    expect(html).toContain("Next Meeting");
    expect(html).toContain("Counseling Progress");
    expect(html).toContain('class="grid items-stretch gap-4 sm:grid-cols-2"');
    expect(html.match(/h-full p-5/g)).toHaveLength(4);
    expect(html).toContain("-space-x-3");
    expect(html.match(/border-2 border-white/g)).toHaveLength(2);
    expect(html).toContain("Not Started");
    expect(html).toContain("Your Homework status is private to you.");
    expect(html).not.toContain("response");
    expect(html.indexOf("Current Session")).toBeLessThan(html.indexOf("Your Homework"));
    expect(html.indexOf("Your Homework")).toBeLessThan(html.indexOf("Next Meeting"));
    expect(html.indexOf("Next Meeting")).toBeLessThan(html.indexOf("Counseling Progress"));
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

  it("uses the Initial Meeting state before a Session is scheduled", () => {
    const html = renderToStaticMarkup(createElement(CoupleWorkspace, { data: { ...data, currentSession: null, homework: null }, prepareEnrich: null }));
    expect(html).toContain("Initial Meeting");
    expect(html).toContain("Your Homework");
    expect(html).toContain("No homework assigned yet.");
    expect(html).not.toContain("Status:");
  });
});
