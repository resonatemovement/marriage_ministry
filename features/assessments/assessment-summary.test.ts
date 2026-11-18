import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AssessmentSummary } from "./assessment-summary";

describe("shared Assessment summary", () => {
  it("renders the generic title, requirement, participant progress, result values without a redundant prefix, and a semantic action", () => {
    const markup = renderToStaticMarkup(createElement(AssessmentSummary, {
      title: "Communication Styles",
      requirement: "Required",
      progress: "2 of 2 submitted",
      participants: [{ id: "profile-1", name: "Alex Example", status: "Submitted", primaryResults: ["Listening", "Repair"] }],
    }, createElement("a", { href: "/workspace/assessments/assignment-1" }, "View Results")));

    expect(markup).toContain("Communication Styles");
    expect(markup).toContain("Required");
    expect(markup).toContain("2 of 2 submitted");
    expect(markup).toContain("Alex Example");
    expect(markup).toContain("Listening, Repair");
    expect(markup).not.toContain("Primary results:");
    expect(markup).toContain('<a href="/workspace/assessments/assignment-1">View Results</a>');
    expect(markup).not.toMatch(/question|response|answer/i);
  });

  it("supports an optional Assessment and an incomplete participant without exposing results", () => {
    const markup = renderToStaticMarkup(createElement(AssessmentSummary, {
      title: "Future Assessment Type",
      requirement: "Optional",
      progress: "1 of 2 submitted",
      participants: [
        { id: "male", name: "Jordan Example", status: "Submitted" },
        { id: "female", name: "Taylor Example", status: "In Progress" },
      ],
    }));

    expect(markup).toContain("Optional");
    expect(markup).toContain("Jordan Example");
    expect(markup).toContain("Taylor Example");
    expect(markup).toContain("Submitted");
    expect(markup).toContain("In Progress");
    expect(markup).not.toContain("Primary results");
  });
});
