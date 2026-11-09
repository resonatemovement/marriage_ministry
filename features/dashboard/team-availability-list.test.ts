import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeamAvailabilityList } from "./team-availability-list";

const teams = [
  { id: "coach-id", name: "Fremont Coach Team", role: "Coach" as const, campus: "Fremont", acceptingNewCouples: true, coupleCount: 1 },
  { id: "counselor-id", name: "Oakland Counselor Team", role: "Counselor" as const, campus: "Oakland", acceptingNewCouples: false, coupleCount: 3 },
];

describe("Team Availability list", () => {
  it("renders the default accepting, zero-Couple filter and clickable list rows", () => {
    const html = renderToStaticMarkup(createElement(TeamAvailabilityList, { teams, view: "available", search: "" }));
    expect(html).toContain("Accepting · 0 Couples");
    expect(html).toContain("No teams match these filters");
    expect(html).not.toContain("Fremont Coach Team");
  });

  it("renders All Teams with a dedicated Couple count and context-preserving detail links", () => {
    const html = renderToStaticMarkup(createElement(TeamAvailabilityList, { teams, view: "all", search: "Fremont" }));
    expect(html).toContain('href="/people/coach-id?from=team-availability&amp;returnTo=%2Fdashboard%2Fteam-availability%3Fview%3Dall%26q%3DFremont"');
    expect(html).toContain("Fremont Coach Team");
    expect(html).toContain("1 Couple");
    expect(html).not.toContain("Oakland Counselor Team");
  });

  it("shows an authorization-safe unavailable state", () => {
    const html = renderToStaticMarkup(createElement(TeamAvailabilityList, { teams: null, view: "all", search: "", error: true }));
    expect(html).toContain("Team Availability is temporarily unavailable");
    expect(html).not.toContain("No teams match these filters");
  });
});
