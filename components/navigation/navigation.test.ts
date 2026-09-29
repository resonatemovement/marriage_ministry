import { describe, expect, it } from "vitest";
import { workspaceNavigation } from "./navigation";
import { availableWorkspacesForRoles } from "@/lib/workspaces";

describe("Resource Library navigation access", () => {
  it("appears after Session Builder for Admin and Author workspaces", () => {
    expect(workspaceNavigation.admin.map((item) => item.label)).toContain("Resource Library");
    expect(workspaceNavigation.admin.findIndex((item) => item.href === "/resource-library"))
      .toBe(workspaceNavigation.admin.findIndex((item) => item.href === "/session-builder") + 1);
    expect(workspaceNavigation.author.map((item) => item.label)).toContain("Resource Library");
    expect(workspaceNavigation.author.findIndex((item) => item.href === "/resource-library"))
      .toBe(workspaceNavigation.author.findIndex((item) => item.href === "/session-builder") + 1);
  });

  it("does not expose it in unauthorized workspaces", () => {
    for (const workspace of ["campus_lead", "coach", "counselor", "couple"] as const) {
      expect(workspaceNavigation[workspace].some((item) => item.href === "/resource-library")).toBe(false);
    }
  });

  it("maps only Super Admin, Admin, and Author roles to a visible Resource Library workspace", () => {
    for (const role of ["super_admin", "admin"] as const) {
      const workspaces = availableWorkspacesForRoles([role]).map((workspace) => workspace.id);
      expect(workspaces.some((workspace) => workspaceNavigation[workspace].some((item) => item.href === "/resource-library"))).toBe(true);
    }
    expect(availableWorkspacesForRoles(["author"]).some((workspace) => workspaceNavigation[workspace.id].some((item) => item.href === "/resource-library"))).toBe(true);
    for (const role of ["campus_lead", "coach", "counselor", "couple"] as const) {
      const workspaces = availableWorkspacesForRoles([role]);
      expect(workspaces.some((workspace) => workspaceNavigation[workspace.id].some((item) => item.href === "/resource-library"))).toBe(false);
    }
  });
});
