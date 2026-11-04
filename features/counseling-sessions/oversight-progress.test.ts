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
  campus: "Oakland",
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
    expect(markup).toContain("Oakland");
  });

  it("keeps the supervised team row stacked on narrow screens and interactive", () => {
    const markup = renderToStaticMarkup(createElement(TeamCounselingProgress, {
      teamId: "coach-team",
      progress: [],
      childTeams: [childTeam],
    }));

    expect(markup).toContain("flex min-w-0 flex-col gap-1 px-2 py-2 sm:flex-row");
    expect(markup).toContain("pl-11 text-xs text-text-muted sm:ml-auto");
    expect(markup).toContain('aria-label="Expand Counselor team Counselor Team Name"');
    expect(markup).toContain('href="/people/counselor-team"');
    expect(markup).toContain("No active Couples assigned to this team.");
  });
});
