import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { SessionWorkspaceNavigation } from "./session-workspace-navigation";
import { sessionNavigationRequest, sessionWorkspaceFromSearch, sessionWorkspaceHref } from "./workspace";

describe("Session Builder workspaces", () => {
  it("keeps Session Material as the default and creates a Homework route only when selected", () => {
    expect(sessionWorkspaceFromSearch(undefined)).toBe("material");
    expect(sessionWorkspaceFromSearch("homework")).toBe("homework");
    expect(sessionWorkspaceHref("session-1", "material")).toBe("/session-builder/session-1");
    expect(sessionWorkspaceHref("session-1", "homework")).toBe("/session-builder/session-1?workspace=homework");
  });

  it("preserves the active workspace and requires confirmation only for dirty Session switches", () => {
    expect(sessionNavigationRequest("session-2", "session-1", "homework", false)).toEqual({ destination: "/session-builder/session-2?workspace=homework", requiresConfirmation: false });
    expect(sessionNavigationRequest("session-2", "session-1", "material", true)).toEqual({ destination: "/session-builder/session-2", requiresConfirmation: true });
    expect(sessionNavigationRequest("session-1", "session-1", "homework", true)).toEqual({ destination: null, requiresConfirmation: false });
  });

  it("presents both accessible workspaces and marks Session Material active by default", () => {
    const markup = renderToStaticMarkup(createElement(SessionWorkspaceNavigation, { sessionId: "session-1", activeWorkspace: "material" }));
    expect(markup).toContain('aria-label="Session authoring workspaces"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("Session Material");
    expect(markup).toContain("Homework");
  });
});
