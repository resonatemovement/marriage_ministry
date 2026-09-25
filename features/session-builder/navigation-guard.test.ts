import { describe, expect, it } from "vitest";

import { eligibleInternalNavigation } from "./navigation-guard";

const currentHref = "https://resonate.example/session-builder/session-1";

describe("Session Builder internal navigation guard", () => {
  it("returns same-origin application destinations", () => {
    expect(eligibleInternalNavigation({ href: "/people", currentHref })).toBe("/people");
  });

  it.each([
    ["external link", { href: "https://example.com/elsewhere" }],
    ["new tab", { href: "/people", target: "_blank" }],
    ["download", { href: "/export.csv", download: true }],
    ["meta click", { href: "/people", metaKey: true }],
    ["ctrl click", { href: "/people", ctrlKey: true }],
    ["shift click", { href: "/people", shiftKey: true }],
    ["alt click", { href: "/people", altKey: true }],
    ["non-primary click", { href: "/people", button: 1 }],
    ["hash-only link", { href: "#details" }],
    ["same destination", { href: currentHref }],
  ])("ignores %s", (_, input) => {
    expect(eligibleInternalNavigation({ currentHref, ...input })).toBeNull();
  });

  it("does not intercept Session Material/Homework workspace switches", () => {
    expect(eligibleInternalNavigation({ currentHref, href: "/session-builder/session-1?workspace=homework", sessionId: "session-1" })).toBeNull();
    expect(eligibleInternalNavigation({ currentHref: `${currentHref}?workspace=homework`, href: "/session-builder/session-1", sessionId: "session-1" })).toBeNull();
  });
});
