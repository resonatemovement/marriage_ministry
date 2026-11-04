import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  progress: vi.fn(async (teamId: string) => [{ teamId, caseId: `${teamId}-case` }]),
  counselors: vi.fn(async (teamId: string) => [{ id: `${teamId}-counselor`, name: "Counselor Team", campus: "Oakland" }]),
}));
vi.mock("server-only", () => ({}));
vi.mock("./oversight-queries", () => ({ getCounselingOversightProgress: mocks.progress, getOversightCounselorTeams: mocks.counselors }));

import { getCampusLeadCoachNodes, getCoachCounselorNodes, getOversightCounselorNodes } from "./oversight-rail-queries";

describe("workspace hierarchy progress loaders", () => {
  beforeEach(() => { mocks.progress.mockClear(); mocks.counselors.mockClear(); });

  it("loads direct Coach cases and only its supervised Counselor teams for a Campus Lead", async () => {
    const nodes = await getCampusLeadCoachNodes([{ id: "coach", name: "Coaches", campus: "Oakland" }]);
    expect(nodes[0]).toMatchObject({ id: "coach", role: "Coach", href: "/workspace/coaches/coach", cases: [{ caseId: "coach-case" }] });
    expect(nodes[0]?.children[0]).toMatchObject({ id: "coach-counselor", role: "Counselor", href: "/people/coach-counselor", cases: [{ caseId: "coach-counselor-case" }] });
    expect(mocks.counselors).toHaveBeenCalledWith("coach");
  });

  it("loads Coach rail Counselor teams without adding subordinate Couples to the direct Sessions list", async () => {
    const nodes = await getCoachCounselorNodes([{ id: "counselor", name: "Counselors", campus: null }]);
    expect(nodes[0]).toMatchObject({ id: "counselor", href: "/workspace/counselors/counselor", cases: [{ caseId: "counselor-case" }], children: [] });
  });

  it("uses the existing People destination for counselor details under team management", async () => {
    const nodes = await getOversightCounselorNodes("coach", "people");
    expect(nodes[0]?.href).toBe("/people/coach-counselor");
  });
});
