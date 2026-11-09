import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeamAvailabilityCarousel } from "./team-availability-carousel";

const team = { id: "team-id", name: "Fremont Counselor Team", role: "Counselor" as const, campus: "Fremont", acceptingNewCouples: true, coupleCount: 0 };

describe("Team Availability carousel", () => {
  it("shows a linked available team and hides navigation for a single item", () => {
    const html = renderToStaticMarkup(createElement(TeamAvailabilityCarousel, { teams: [team] }));
    expect(html).toContain("Team Availability");
    expect(html).toContain("Fremont Counselor Team");
    expect(html).toContain("Counselor");
    expect(html).toContain("Fremont");
    expect(html).toContain("Accepting New Couples");
    expect(html).toContain("0 Couples");
    expect(html).toContain("View All Teams");
    expect(html).toContain("/people/team-id?from=team-availability");
    expect(html).not.toContain("Next available team");
  });

  it("shows a clear empty state without carousel controls", () => {
    const html = renderToStaticMarkup(createElement(TeamAvailabilityCarousel, { teams: [] }));
    expect(html).toContain("No active teams are currently accepting new Couples.");
    expect(html).not.toContain("Next available team");
  });
});
