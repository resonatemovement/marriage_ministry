import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CoachCounselorsRail } from "./workspace-rail";

describe("Coach Counselors rail", () => {
  it("shows the supervised team count, campus, and detail navigation", () => {
    const markup = renderToStaticMarkup(createElement(CoachCounselorsRail, { counselors: [{ id: "team-1", name: "John & Stacy Wu", campus: "Oakland", href: "/workspace/counselors/team-1", role: "Counselor", cases: [], children: [] }] }));
    expect(markup).toContain("Counselors");
    expect(markup).toContain(">1</span>");
    expect(markup).toContain("John &amp; Stacy Wu");
    expect(markup).toContain("Counselor · Oakland · 0 Couples");
    expect(markup).toContain('href="/workspace/counselors/team-1"');
    expect(markup).not.toContain("Assign");
    expect(markup).not.toContain("Remove");
  });

  it("provides the shared empty state when the active Coach team supervises no Counselors", () => {
    const markup = renderToStaticMarkup(createElement(CoachCounselorsRail, { counselors: [] }));
    expect(markup).toContain("Counselors");
    expect(markup).toContain(">0</span>");
    expect(markup).toContain("No counselors assigned.");
  });

  it.each([
    [0, "0 Couples"],
    [1, "1 Couple"],
    [2, "2 Couples"],
  ])("pluralizes the hierarchy Couple count for %i assigned Cases", (count, expectedLabel) => {
    const cases = Array.from({ length: count }, (_, index) => ({
      teamId: "team-1",
      teamName: "John & Stacy Wu",
      caseId: `case-${index + 1}`,
      coupleId: `couple-${index + 1}`,
      coupleName: `Couple ${index + 1}`,
      caseStatus: "Active",
      sessionProgress: "1 of 12 Sessions",
      nextMeetingAt: null,
      homeworkStatus: "Complete",
    }));
    const markup = renderToStaticMarkup(createElement(CoachCounselorsRail, {
      counselors: [{ id: "team-1", name: "John & Stacy Wu", campus: "Fremont", href: "/workspace/counselors/team-1", role: "Counselor", cases, children: [] }],
    }));

    expect(markup).toContain(expectedLabel);
    expect(markup).toContain(`Counselor · Fremont · ${expectedLabel}`);
    expect(markup.indexOf("John &amp; Stacy Wu")).toBeLessThan(markup.indexOf(`Counselor · Fremont · ${expectedLabel}`));
    expect(markup).not.toContain("sm:ml-auto");
  });
});
