import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CaseDetailTabs } from "./case-detail-tabs";

describe("CaseDetailTabs", () => {
  it("uses the approved accessible segmented tabs and opens Session by default", () => {
    const markup = renderToStaticMarkup(createElement(CaseDetailTabs, {
      session: createElement("p", null, "Current Session panel"),
      homework: createElement("p", null, "Homework history panel"),
      meetings: createElement("p", null, "Meetings panel"),
      settings: createElement("p", null, "Settings panel"),
    }));

    expect(markup).toMatch(/role="tablist"[^>]*aria-label="Counseling case sections"/);
    expect(markup).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*data-state="active"/);
    expect(markup.indexOf(">Session</button>")).toBeLessThan(markup.indexOf(">Homework</button>"));
    expect(markup).toContain(">Meetings &amp; Reminders</button>");
    expect(markup).toContain(">Settings</button>");
    expect(markup).toContain("Current Session panel");
    expect(markup).not.toContain("Homework history panel");
  });

  it.each([
    ["homework", "Homework history panel"],
    ["meetings", "Meetings panel"],
    ["settings", "Settings panel"],
  ] as const)("renders the selected %s tab panel", (defaultTab, expectedPanel) => {
    const markup = renderToStaticMarkup(createElement(CaseDetailTabs, {
      defaultTab,
      session: createElement("p", null, "Current Session panel"),
      homework: createElement("p", null, "Homework history panel"),
      meetings: createElement("p", null, "Meetings panel"),
      settings: createElement("p", null, "Settings panel"),
    }));

    expect(markup).toContain(expectedPanel);
    expect(markup).not.toContain("Current Session panel");
  });
});
