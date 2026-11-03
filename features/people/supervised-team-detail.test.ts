import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ selected: "", filters: [] as [string, unknown][], group: {
  id: "team-1", name: "John & Stacy Wu", group_type: "counselor_team", active: true, updated_at: "2026-11-03T10:00:00Z",
  campus: { id: "campus-1", name: "Oakland" },
  group_members: [{ ended_at: null, profile: { id: "member-1", first_name: "John", last_name: "Wu", gender: "male", email: "john@example.test", phone: "5105550101", campus_id: "campus-1", photo_path: "john.jpg", status: "active", onboarding_completed_at: "2026-11-01T10:00:00Z" } }, { ended_at: "2026-10-01T00:00:00Z", profile: { id: "former", first_name: "Former", last_name: "Member", status: "active" } }],
} }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/profile-photo", () => ({ getProfilePhotoUrl: vi.fn(async (path: string | null) => path ? `https://photos.example.test/${path}` : null) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: (table: string) => {
      const query: Record<string, (...args: unknown[]) => unknown> = {};
      query.select = (columns: unknown) => { mocks.selected = String(columns); return query; };
      query.eq = (column: unknown, value: unknown) => { mocks.filters.push([String(column), value]); return query; };
      query.maybeSingle = async () => ({ data: mocks.filters.every(([column, value]) => mocks.group[column as keyof typeof mocks.group] === value) ? mocks.group : null, error: null });
      void table;
      return query;
    },
  }),
}));

import { getSupervisedTeamDetail } from "./detail-queries";

describe("supervised team detail query", () => {
  beforeEach(() => { mocks.selected = ""; mocks.filters = []; });

  it("loads shared People member-card fields without querying invitations or Couple/Case records", async () => {
    const detail = await getSupervisedTeamDetail("team-1", "counselor_team");

    expect(detail).toMatchObject({
      id: "team-1", type: "counselors", name: "John & Stacy Wu", campus: "Oakland",
      members: [{ name: "John Wu", email: "john@example.test", phone: "5105550101", photoUrl: "https://photos.example.test/john.jpg", accountStatus: "Active", onboardingComplete: true }],
      assignedCouples: [],
    });
    expect(mocks.selected).toContain("email,phone,campus_id,photo_path,status,onboarding_completed_at");
    expect(mocks.selected).not.toMatch(/invitations|case_assignments|counseling_cases|intake_requests|supervision_assignments/);
    expect(mocks.filters).toEqual([["id", "team-1"], ["group_type", "counselor_team"], ["active", true]]);
  });

  it("constrains the detail query to the expected active team type", async () => {
    await expect(getSupervisedTeamDetail("team-1", "coach_team")).resolves.toBeNull();
    expect(mocks.filters).toContainEqual(["group_type", "coach_team"]);
  });
});
