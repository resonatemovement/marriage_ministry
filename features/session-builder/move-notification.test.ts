import { describe, expect, it } from "vitest";

import { homeworkPageMoveFeedback, sessionBuilderHref, sessionMoveFeedback } from "./move-notification";
import type { SessionSummary } from "./types";

const sourceSession: SessionSummary = { id: "source", sequenceNumber: 1, curriculumNumber: 1, title: "Foundations", status: "draft", isFinal: false, updatedAt: "now" };
const destinationSession: SessionSummary = { id: "destination", sequenceNumber: 2, curriculumNumber: 2, title: "Communication", status: "draft", isFinal: false, updatedAt: "now" };

describe("Session Builder move feedback", () => {
  it("identifies the Homework item and both page names without claiming it was saved", () => {
    expect(homeworkPageMoveFeedback("4 R’s of Gospel Transformation", { position: 1, title: "Practice" }, { position: 0, title: "I Statements" })).toEqual({
      title: "Content moved to Page 1: I Statements",
      description: "“4 R’s of Gospel Transformation” moved from Page 2: Practice to Page 1: I Statements. This draft change is not saved yet; choose Save Draft to persist it.",
    });
  });

  it("explains that a cross-Session Homework move includes the whole page and content", () => {
    const result = sessionMoveFeedback("homework_page", "Page 2: Reflection", sourceSession, destinationSession);
    expect(result.title).toBe("Homework page moved successfully");
    expect(result.description).toContain("Page 2: Reflection and all its content");
    expect(result.description).toContain("Session 1: Foundations");
    expect(result.description).toContain("Session 2: Communication");
    expect(result.destinationHref).toBe("/session-builder/destination?workspace=homework");
  });

  it("identifies Session Material PAGE/resource transfers and preserves the material workspace", () => {
    expect(sessionMoveFeedback("session_material_page", "Page 1: Welcome", sourceSession, destinationSession)).toMatchObject({
      title: "Session Material moved successfully",
      description: expect.stringContaining("Page 1: Welcome"),
      destinationHref: "/session-builder/destination?workspace=material",
    });
    expect(sessionBuilderHref("destination", "session_material_resource")).toBe("/session-builder/destination?workspace=material");
  });
});
