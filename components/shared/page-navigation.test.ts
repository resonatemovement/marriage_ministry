import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PageNavigation } from "./page-navigation";

describe("shared page navigation", () => {
  it("renders ordered full-width page buttons with a neutral selected state and consistent Add Page action", () => {
    const markup = renderToStaticMarkup(createElement(PageNavigation, {
      ariaLabel: "Homework pages",
      pages: [{ id: "one", title: "Welcome" }, { id: "two", title: "A longer page title" }],
      selectedPageId: "two",
      emptyMessage: "No pages yet.",
      onSelect: vi.fn(),
      onAddPage: vi.fn(),
    }));

    expect(markup).toContain("PAGE 1");
    expect(markup).toContain("PAGE 2");
    expect(markup.indexOf("PAGE 1")).toBeLessThan(markup.indexOf("Welcome"));
    expect(markup.indexOf("PAGE 2")).toBeLessThan(markup.indexOf("A longer page title"));
    expect(markup).toMatch(/aria-current="page" class="[^\"]*border-text-muted\/30 bg-surface-muted/);
    expect(markup).toContain("w-full gap-1 rounded-md border px-3 py-2 text-left transition");
    expect(markup).toContain("break-words");
    expect(markup).toContain("focus-visible:ring-2");
    expect(markup).not.toContain("content block");
    expect(markup).not.toContain("Selected");
    expect(markup).toContain("Add Page");
    expect(markup.indexOf('aria-label="Pages"')).toBeLessThan(markup.indexOf("Add Page"));
  });
});
