import { describe, expect, it } from "vitest";

import {
  availableWorkspacesForRoles,
  defaultWorkspaceForRoles,
} from "./workspaces";

describe("workspace resolution", () => {
  it("maps Admin and Super Admin roles to the Admin Workspace", () => {
    expect(availableWorkspacesForRoles(["admin"])).toMatchObject([{ id: "admin" }]);
    expect(availableWorkspacesForRoles(["super_admin"])).toMatchObject([{ id: "admin" }]);
  });

  it("maps a Coach role to the Coach Workspace", () => {
    expect(availableWorkspacesForRoles(["coach"])).toMatchObject([{ id: "coach" }]);
  });

  it("supports multiple roles without duplicate workspaces", () => {
    expect(availableWorkspacesForRoles(["coach", "admin", "admin"])).toMatchObject([
      { id: "admin" },
      { id: "coach" },
    ]);
  });

  it("uses the centralized fallback order for the default workspace", () => {
    expect(defaultWorkspaceForRoles(["couple", "author", "counselor"])).toMatchObject({
      id: "counselor",
    });
  });
});
