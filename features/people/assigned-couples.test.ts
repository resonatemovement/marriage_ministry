import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./detail-actions", () => ({
  assignCoupleToCounselorOfRecord: vi.fn(),
}));
vi.mock("./unassign-counselor-of-record", () => ({
  UnassignCounselorOfRecord: ({ coupleId, caseId, providerId, assignmentType }: { coupleId: string; caseId?: string; providerId?: string; assignmentType?: string }) => createElement("span", { "data-couple-id": coupleId, "data-case-id": caseId, "data-team-id": providerId, "data-assignment-type": assignmentType }),
}));
import { AssignedCouples } from "./assigned-couples";

describe("Counselor assigned couples", () => {
  it("renders the shared Assigned Couples card with only direct Counselor assignments", () => {
    const markup = renderToStaticMarkup(createElement(AssignedCouples, {
      detailId: "counselor-team",
      teamName: "Counselor Team",
      assignedCouples: [{ id: "direct-couple", caseId: "case-1", name: "Jordan & Casey", campus: "Fremont", status: "matched", assignedAt: "2026-09-11" }],
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

describe("Coach assigned couples", () => {
  it("renders every Coach-assigned couple and a matching count", () => {
    const markup = renderToStaticMarkup(createElement(AssignedCouples, {
      detailId: "coach-team",
      teamName: "Coach Team",
      assignedCouples: [
        { id: "couple-1", caseId: "case-1", name: "Jordan & Casey", campus: "Fremont", status: "matched", assignedAt: "2026-09-11" },
        { id: "couple-2", caseId: "case-2", name: "Sam & Taylor", campus: "Fremont", status: "active", assignedAt: "2026-09-12" },
      ],
      eligibleCouples: [],
      canManage: false,
      canUnassign: false,
      teamType: "coach",
    }));

    expect(markup).toContain(">2<");
    expect(markup).toContain("Jordan &amp; Casey");
    expect(markup).toContain("Sam &amp; Taylor");
  });

  it("passes case, Couple, and Coach Team identifiers to the Coach-specific unassign action", () => {
    const markup = renderToStaticMarkup(createElement(AssignedCouples, {
      detailId: "coach-team",
      teamName: "Coach Team",
      assignedCouples: [{ id: "couple-1", caseId: "case-1", name: "Jordan & Casey", campus: "Fremont", status: "matched", assignedAt: "2026-09-11" }],
      eligibleCouples: [],
      canManage: true,
      canUnassign: true,
      teamType: "coach",
    }));

    expect(markup).toContain('data-couple-id="couple-1"');
    expect(markup).toContain('data-case-id="case-1"');
    expect(markup).toContain('data-team-id="coach-team"');
    expect(markup).toContain('data-assignment-type="coach"');
  });

  it("renders zero when the Coach Team has no assigned couples", () => {
    const markup = renderToStaticMarkup(createElement(AssignedCouples, {
      detailId: "coach-team",
      teamName: "Coach Team",
      assignedCouples: [],
      eligibleCouples: [],
      canManage: false,
      canUnassign: false,
      teamType: "coach",
    }));

    expect(markup).toContain(">0<");
    expect(markup).toContain("No couples are currently assigned to this Coach team.");
  });
});
