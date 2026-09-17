import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./detail-actions", () => ({
  assignCoupleToCounselorOfRecord: vi.fn(),
}));
import { AssignedCouples } from "./assigned-couples";

describe("Counselor assigned couples", () => {
  it("renders the shared Assigned Couples card with only direct Counselor assignments", () => {
    const markup = renderToStaticMarkup(createElement(AssignedCouples, {
      detailId: "counselor-team",
      teamName: "Counselor Team",
      assignedCouples: [{ id: "direct-couple", name: "Jordan & Casey", campus: "Fremont", status: "matched", assignedAt: "2026-09-11" }],
      eligibleCouples: [],
      canManage: true,
      canUnassign: true,
      teamType: "counselor",
    }));

    expect(markup).toContain("Assigned Couples");
    expect(markup).toContain(">1<");
    expect(markup).toContain("Jordan &amp; Casey");
    expect(markup).toContain("Fremont · matched");
    expect(markup).toContain("No eligible couples available to assign.");
    expect(markup).toContain("More actions for Jordan &amp; Casey");
  });
});
