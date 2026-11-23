import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SessionList } from "./session-list";

describe("Session Builder status navigation", () => {
  it("uses the shared scrollable segmented navigation and preserves status URLs", () => {
    const markup = renderToStaticMarkup(createElement(SessionList, {
      sessions: [],
      status: "published",
    }));

    expect(markup).toContain('aria-label="Session filters"');
    expect(markup).toContain('href="/session-builder?status=published"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('href="/session-builder?status=draft"');
    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain("min-w-max");
    expect(markup).toContain("bg-surface-muted p-1");
  });
});
