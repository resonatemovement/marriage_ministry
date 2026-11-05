import { describe, expect, it } from "vitest";

import {
  defaultWorkspaceDestination,
  loginDestination,
  postLoginDestination,
  workspaceForPath,
} from "./authorization";

describe("workspace authorization routing", () => {
  it("recognizes only protected feature paths", () => {
    expect(workspaceForPath("/people")).toBe("admin");
    expect(workspaceForPath("/workspace")).toBeUndefined();
    expect(workspaceForPath("https://example.com")).toBeUndefined();
  });

  it("sends each role to its authorized Dashboard or Workspace entry", () => {
    expect(defaultWorkspaceDestination(["admin"])).toBe("/dashboard");
    expect(defaultWorkspaceDestination(["coach"])).toBe("/workspace");
    expect(defaultWorkspaceDestination(["counselor"])).toBe("/workspace");
    expect(defaultWorkspaceDestination(["author"])).toBe("/workspace");
    expect(defaultWorkspaceDestination(["couple"])).toBe("/workspace");
    expect(defaultWorkspaceDestination(["admin", "coach"])).toBe("/dashboard");
  });

  it("falls back to the shared workspace when a feature route is not permitted", () => {
    expect(postLoginDestination(["coach"], "/people")).toBe("/workspace");
  });

  it("preserves a permitted protected destination after sign-in", () => {
    expect(postLoginDestination(["admin"], "/people")).toBe("/people");
    expect(postLoginDestination(["admin"], "/dashboard")).toBe("/dashboard");
    expect(postLoginDestination(["campus_lead"], "/dashboard")).toBe("/dashboard");
    expect(postLoginDestination(["coach"], "/dashboard")).toBe("/workspace");
  });

  it("does not preserve the shared workspace as a login return path", () => {
    expect(loginDestination("/workspace")).toBe("/login");
    expect(loginDestination("/people")).toBe("/login?next=%2Fpeople");
  });
});
