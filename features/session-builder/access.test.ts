import { describe, expect, it, vi } from "vitest";

const { requireOneOfRoles } = vi.hoisted(() => ({ requireOneOfRoles: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireOneOfRoles }));

import { requireSessionBuilderAccess } from "./access";

describe("Session Builder authoring access", () => {
  it("uses only the approved authoring roles and excludes operational/couple roles", async () => {
    requireOneOfRoles.mockResolvedValue({ roles: ["author"] });
    await requireSessionBuilderAccess("/session-builder");
    expect(requireOneOfRoles).toHaveBeenCalledWith(["super_admin", "admin", "author"], "/session-builder");
    expect(requireOneOfRoles.mock.calls[0]?.[0]).not.toEqual(expect.arrayContaining(["campus_lead", "coach", "counselor", "couple"]));
  });
});
