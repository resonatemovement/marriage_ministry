import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentCoachCaseScope: vi.fn(),
  filters: [] as { table: string; method: string; args: unknown[] }[],
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.createClient }));
vi.mock("server-only", () => ({}));
vi.mock("./workspace-queries", () => ({ getCurrentCoachCaseScope: mocks.getCurrentCoachCaseScope }));
vi.mock("@/lib/storage/profile-photo", () => ({ getProfilePhotoUrl: vi.fn() }));

import { getCounselingSessionCards } from "./queries";

function createQuery(table: string) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "in", "order"]) {
    query[method] = (...args: unknown[]) => {
      mocks.filters.push({ table, method, args });
      return query;
    };
  }
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [], error: null }));
  return query;
}

describe("Counseling Sessions Coach workspace query scope", () => {
  beforeEach(() => {
    mocks.filters.length = 0;
    mocks.getCurrentCoachCaseScope.mockReset();
    mocks.getCurrentCoachCaseScope.mockResolvedValue({ caseIds: ["assigned-case"], coupleContactCaseIds: [] });
    mocks.createClient.mockResolvedValue({
      from: (table: string) => createQuery(table),
      rpc: () => Promise.resolve({ data: [], error: null }),
    });
  });

  it("applies the Coach scope in the database query before projecting cards", async () => {
    await getCounselingSessionCards("coach");

    expect(mocks.getCurrentCoachCaseScope).toHaveBeenCalledOnce();
    expect(mocks.filters).toContainEqual({ table: "counseling_cases", method: "in", args: ["id", ["assigned-case"]] });
    expect(mocks.filters).toContainEqual({ table: "case_session_meetings", method: "in", args: ["counseling_case_id", ["assigned-case"]] });
    expect(mocks.filters).toContainEqual({ table: "case_sessions", method: "in", args: ["counseling_case_id", ["assigned-case"]] });
    expect(mocks.filters).toContainEqual({ table: "homework_assignments", method: "in", args: ["counseling_case_id", ["assigned-case"]] });
  });

  it("leaves non-Coach workspace visibility behavior unchanged", async () => {
    await getCounselingSessionCards("counselor");

    expect(mocks.getCurrentCoachCaseScope).not.toHaveBeenCalled();
    expect(mocks.filters.some(({ method }) => method === "in")).toBe(false);
  });
});
