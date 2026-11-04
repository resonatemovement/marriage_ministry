import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TeamCounselingProgress } from "./oversight-progress";
import type { CounselingOversightProgress } from "./oversight-queries";
import type { OversightTeamNode } from "./oversight-rail-queries";

const progress: CounselingOversightProgress[] = [{
  teamId: "coach-team",
  teamName: "Coach Team",
  caseId: "case-1",
  coupleId: "couple-1",
  coupleName: "Alex & Blair",
  caseStatus: "Active",
  sessionProgress: "2 of 12 Sessions",
  nextMeetingAt: null,
  homeworkStatus: "Complete",
}];

const childTeam: OversightTeamNode = {
  id: "counselor-team",
  name: "Counselor Team Name",
  campus: "Fremont",
  href: "/people/counselor-team",
  role: "Counselor",
  cases: [],
  children: [],
};

describe("team counseling progress cards", () => {
  it("renders progress and supervised teams as independent sibling cards", () => {
    const markup = renderToStaticMarkup(createElement(TeamCounselingProgress, {
      teamId: "coach-team",
      progress,
      childTeams: [childTeam],
    }));

    expect((markup.match(/<section/g) ?? [])).toHaveLength(2);
    expect(markup.indexOf("Counseling Progress")).toBeLessThan(markup.indexOf("Supervised Counselor Teams"));
    expect(markup).toContain("Alex &amp; Blair");
    expect(markup).toContain("Counselor Team Name");
    expect(markup).toContain("Fremont");
  });

  it("keeps the team name above wrapping metadata and preserves row interactions", () => {
    const markup = renderToStaticMarkup(createElement(TeamCounselingProgress, {
      teamId: "coach-team",
      progress: [],
      childTeams: [childTeam],
    }));

    expect(markup).toContain("flex min-w-0 items-center gap-2 px-2 py-2 sm:px-3");
    expect(markup).toContain("Counselor · Fremont · 0 Couples");
    expect(markup).toContain("break-words text-xs text-text-muted");
    expect(markup).toContain('aria-label="Expand Counselor team Counselor Team Name"');
    expect(markup).toContain('href="/people/counselor-team"');
    expect(markup).toContain("No active Couples assigned to this team.");
  });
});
