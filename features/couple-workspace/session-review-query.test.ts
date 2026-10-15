import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ caseId: "couple-case", caseRow: { id: "couple-case", status: "finished", closed_at: "2026-10-15T22:13:44Z" } as Record<string, unknown> | null, sessions: [] as Record<string, unknown>[], queries: [] as Array<{ table: string; filters: Array<[string, unknown]>; orderedBy: string | null }> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({
  rpc: vi.fn(async () => ({ data: [{ counseling_case_id: mock.caseId }], error: null })),
  from: vi.fn((table: string) => {
    const query = { table, filters: [] as Array<[string, unknown]>, orderedBy: null as string | null };
    mock.queries.push(query);
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((key: string, value: unknown) => { query.filters.push([key, value]); return builder; }),
      order: vi.fn((key: string) => { query.orderedBy = key; return builder; }),
      maybeSingle: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "counseling_cases" ? mock.caseRow : mock.sessions, error: null }).then(resolve),
    };
    return builder;
  }),
}) }));
vi.mock("@/lib/storage/profile-photo", () => ({ getProfilePhotoUrl: vi.fn() }));
vi.mock("@/features/resource-library/server", () => ({ signedResourceAccess: vi.fn() }));
vi.mock("@/features/counseling-contacts/queries", () => ({ getCurrentCoupleCounselor: vi.fn() }));

import { getCompletedCoupleSessionReview } from "./queries";

describe("completed Couple Session review query", () => {
  beforeEach(() => {
    mock.caseRow = { id: "couple-case", status: "finished", closed_at: "2026-10-15T22:13:44Z" };
    mock.sessions = [
      { id: "one", actual_sequence: 1, template_sequence_number: 1, title: "Pinned one", status: "completed" },
      { id: "two", actual_sequence: 2, template_sequence_number: 2, title: "Pinned two", status: "completed" },
    ];
    mock.queries = [];
  });

  it("reads only assigned case Sessions and orders by actual journey sequence", async () => {
    const result = await getCompletedCoupleSessionReview();
    expect(result?.sessions).toEqual([
      { id: "one", actualSequence: 1, number: 1, title: "Pinned one", status: "completed" },
      { id: "two", actualSequence: 2, number: 2, title: "Pinned two", status: "completed" },
    ]);
    const sessionQuery = mock.queries.find(({ table }) => table === "case_sessions");
    expect(sessionQuery?.filters).toEqual([["counseling_case_id", "couple-case"]]);
    expect(sessionQuery?.orderedBy).toBe("actual_sequence");
  });

  it("does not expose the review list for active or Closed — Incomplete cases", async () => {
    mock.caseRow = { id: "couple-case", status: "active", closed_at: null };
    await expect(getCompletedCoupleSessionReview()).resolves.toBeNull();
    mock.caseRow = { id: "couple-case", status: "inactive", closed_at: "2026-10-15T22:13:44Z" };
    await expect(getCompletedCoupleSessionReview()).resolves.toBeNull();
  });
});
