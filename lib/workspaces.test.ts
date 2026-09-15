import { describe, expect, it } from "vitest";

import {
  availableWorkspacesForRoles,
  defaultWorkspaceForRoles,
} from "./workspaces";

describe("workspace resolution", () => {
  it("maps Admin and Super Admin roles to the Admin Workspace", () => {
    expect(availableWorkspacesForRoles(["admin"])).toMatchObject([{ id: "admin" }]);
    expect(availableWorkspacesForRoles(["super_admin"])).toMatchObject([{ id: "admin" }]);
    expect(defaultWorkspaceForRoles(["super_admin"])).toMatchObject({ id: "admin", href: "/workspace" });
  });

  it("maps a Coach role to the Coach Workspace", () => {
    expect(availableWorkspacesForRoles(["coach"])).toMatchObject([{ id: "coach" }]);
  });

  it("maps Campus Lead to only the Campus Lead Workspace", () => {
    expect(availableWorkspacesForRoles(["campus_lead"])).toMatchObject([{ id: "campus_lead", label: "Campus Lead Workspace" }]);
    expect(defaultWorkspaceForRoles(["campus_lead"])).toMatchObject({ id: "campus_lead" });
    expect(defaultWorkspaceForRoles(["campus_lead", "admin"])).toMatchObject({ id: "admin" });
  });

  it("supports multiple roles without duplicate workspaces", () => {
    expect(availableWorkspacesForRoles(["coach", "admin", "admin"])).toMatchObject([
      { id: "admin" },
      { id: "coach" },
    ]);
  });

  it("uses the centralized fallback order for the default workspace", () => {
    expect(defaultWorkspaceForRoles(["coach", "admin"])).toMatchObject({ id: "admin" });
    expect(defaultWorkspaceForRoles(["couple", "author", "counselor"])).toMatchObject({
      id: "counselor",
    });
  });

  it("defaults Super Admin to the first operational workspace", () => {
    expect(defaultWorkspaceForRoles(["super_admin", "coach"])).toMatchObject({ id: "coach" });
    expect(defaultWorkspaceForRoles(["super_admin", "counselor"])).toMatchObject({ id: "counselor" });
    expect(defaultWorkspaceForRoles(["super_admin", "author"])).toMatchObject({ id: "author" });
    expect(defaultWorkspaceForRoles(["super_admin", "couple"])).toMatchObject({ id: "couple" });
    expect(defaultWorkspaceForRoles(["super_admin", "coach", "author"])).toMatchObject({ id: "coach" });
  });
});
