import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CoachCounselorsRail } from "./workspace-rail";

describe("Coach Counselors rail", () => {
  it("shows the supervised team count, campus, and detail navigation", () => {
    const markup = renderToStaticMarkup(createElement(CoachCounselorsRail, { counselors: [{ id: "team-1", name: "John & Stacy Wu", campus: "Oakland" }] }));
    expect(markup).toContain("Counselors");
    expect(markup).toContain(">1</span>");
    expect(markup).toContain("John &amp; Stacy Wu");
    expect(markup).toContain("Counselor · Oakland");
    expect(markup).toContain('href="/workspace/counselors/team-1"');
    expect(markup).not.toContain("Assign");
    expect(markup).not.toContain("Remove");
  });

  it("provides the shared empty state when the active Coach team supervises no Counselors", () => {
    const markup = renderToStaticMarkup(createElement(CoachCounselorsRail, { counselors: [] }));
    expect(markup).toContain("Counselors");
    expect(markup).toContain(">0</span>");
    expect(markup).toContain("No counselors assigned.");
  });
});
