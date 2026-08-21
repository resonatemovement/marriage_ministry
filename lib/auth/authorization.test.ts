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

  it("sends every permitted role to the shared workspace route", () => {
    expect(defaultWorkspaceDestination(["admin"])).toBe("/workspace");
    expect(defaultWorkspaceDestination(["coach"])).toBe("/workspace");
    expect(defaultWorkspaceDestination(["counselor"])).toBe("/workspace");
    expect(defaultWorkspaceDestination(["author"])).toBe("/workspace");
    expect(defaultWorkspaceDestination(["couple"])).toBe("/workspace");
    expect(defaultWorkspaceDestination(["admin", "coach"])).toBe("/workspace");
  });

  it("falls back to the shared workspace when a feature route is not permitted", () => {
    expect(postLoginDestination(["coach"], "/people")).toBe("/workspace");
  });

  it("preserves a permitted protected destination after sign-in", () => {
    expect(postLoginDestination(["admin"], "/people")).toBe("/people");
  });

  it("does not preserve the shared workspace as a login return path", () => {
    expect(loginDestination("/workspace")).toBe("/login");
    expect(loginDestination("/people")).toBe("/login?next=%2Fpeople");
  });
});
