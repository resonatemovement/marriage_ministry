import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ claims: { claims: { sub: "profile-1" } } as { claims: { sub: string } | null }, roles: [{ role: "couple" }], status: "active", from: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getClaims: async () => ({ data: mocks.claims }) },
    from: (table: string) => {
      mocks.from(table);
      return {
        select: () => ({
          eq: () => table === "profiles"
            ? { maybeSingle: async () => ({ data: { status: mocks.status }, error: null }) }
            : Promise.resolve({ data: mocks.roles, error: null }),
        }),
      };
    },
  }),
}));

import { getPeopleRecords } from "./queries";

describe("Admin Couple list authorization", () => {
  beforeEach(() => {
    mocks.claims = { claims: { sub: "profile-1" } };
    mocks.roles = [{ role: "couple" }];
    mocks.status = "active";
    mocks.from.mockClear();
  });

  it("denies a non-Admin before querying Couple, Case, or photo data", async () => {
    const result = await getPeopleRecords("couples", "", "active");
    expect(result).toEqual({ records: [], error: "unauthorized" });
    expect(mocks.from.mock.calls.map(([table]) => table).sort()).toEqual(["profile_roles", "profiles"]);
  });

  it("denies an inactive Admin profile", async () => {
    mocks.roles = [{ role: "admin" }];
    mocks.status = "deactivated";
    const result = await getPeopleRecords("couples", "", "active");
    expect(result).toEqual({ records: [], error: "unauthorized" });
    expect(mocks.from.mock.calls.map(([table]) => table).sort()).toEqual(["profile_roles", "profiles"]);
  });

  it("denies unauthenticated requests before any data query", async () => {
    mocks.claims = { claims: null };
    const result = await getPeopleRecords("couples", "", "active");
    expect(result).toEqual({ records: [], error: "unauthorized" });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
