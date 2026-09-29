import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ requireOneOfRoles: vi.fn(), authoringWorkspaceFor: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireOneOfRoles: mock.requireOneOfRoles }));
vi.mock("@/features/session-builder/access", () => ({ authoringWorkspaceFor: mock.authoringWorkspaceFor }));

import { requireResourceLibraryAccess, RESOURCE_LIBRARY_ROLES } from "./access";

describe("Resource Library route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.requireOneOfRoles.mockResolvedValue({ roles: ["author"] });
    mock.authoringWorkspaceFor.mockReturnValue("author");
  });

  it("uses the shared authoritative role guard for the protected route", async () => {
    expect(RESOURCE_LIBRARY_ROLES).toEqual(["super_admin", "admin", "author"]);
    await expect(requireResourceLibraryAccess("/resource-library")).resolves.toEqual({ identity: { roles: ["author"] }, workspace: "author" });
    expect(mock.requireOneOfRoles).toHaveBeenCalledWith(RESOURCE_LIBRARY_ROLES, "/resource-library");
    expect(mock.authoringWorkspaceFor).toHaveBeenCalledWith({ roles: ["author"] });
  });
});
