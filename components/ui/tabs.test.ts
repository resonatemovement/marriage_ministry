import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Tabs, TabsContent, TabsList, TabsListViewport, TabsTrigger } from "./tabs";

describe("shared segmented tabs", () => {
  it("provides a horizontally scrollable viewport and visible active, hover, and keyboard focus states", () => {
    const markup = renderToStaticMarkup(createElement(Tabs, { defaultValue: "first" },
      createElement(TabsListViewport, null,
        createElement(TabsList, { "aria-label": "Example sections", className: "min-w-max justify-start" },
          createElement(TabsTrigger, { value: "first" }, "First section"),
          createElement(TabsTrigger, { value: "a-long-second-tab-label" }, "A long second tab label"),
        ),
      ),
      createElement(TabsContent, { value: "first" }, "First panel"),
      createElement(TabsContent, { value: "a-long-second-tab-label" }, "Second panel"),
    ));

    expect(markup).toContain('class="-mx-1 min-w-0 overflow-x-auto pb-1"');
    expect(markup).toContain('role="tablist" aria-orientation="horizontal"');
    expect(markup).toContain('aria-label="Example sections"');
    expect(markup).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*data-state="active"/);
    expect(markup).toContain("rounded-md bg-surface-muted p-1");
    expect(markup).toContain("data-[state=active]:bg-white");
    expect(markup).toContain("hover:text-text-primary");
    expect(markup).toContain("focus-visible:ring-2");
    expect(markup).toContain("First panel");
    expect(markup).not.toContain("Second panel");
  });
});
