import { describe, expect, it } from "vitest";

import { availableWorkspacesForRoles, defaultWorkspaceForRoles } from "./workspaces";
import { resolveActiveWorkspace } from "./workspace-selection";

describe("active workspace selection", () => {
  it("keeps single-role users in their only workspace", () => {
    expect(resolveActiveWorkspace(["coach"], undefined)).toBe("coach");
  });

  it("keeps Admin first in the available list but defaults Super Admin to Coach", () => {
    const workspaces = availableWorkspacesForRoles(["super_admin", "coach", "coach"]).map(
      (workspace) => workspace.id,
    );

    expect(workspaces).toEqual(["admin", "coach"]);
    expect(defaultWorkspaceForRoles(["super_admin", "coach", "coach"])?.id).toBe("coach");
    expect(resolveActiveWorkspace(workspaces, undefined, "coach")).toBe("coach");
  });

  it("accepts permitted workspace switches", () => {
    expect(resolveActiveWorkspace(["admin", "coach"], "coach")).toBe("coach");
    expect(resolveActiveWorkspace(["admin", "coach"], "admin")).toBe("admin");
  });

  it("falls back when a workspace selection is invalid or not permitted", () => {
    expect(resolveActiveWorkspace(["admin", "coach"], "counselor", "coach")).toBe("coach");
    expect(resolveActiveWorkspace(["admin", "coach"], "not-a-workspace", "coach")).toBe("coach");
  });
});
