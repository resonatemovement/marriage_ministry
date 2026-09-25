import { describe, expect, it } from "vitest";

import { withCurriculumNumbers } from "./presentation";
import type { SessionSummary } from "./types";

function session(id: string, sequenceNumber: number): SessionSummary {
  return { id, sequenceNumber, curriculumNumber: 0, title: id, status: "draft", updatedAt: "" };
}

describe("Session curriculum numbering", () => {
  it("derives contiguous display numbers without changing database sequence values or order", () => {
    const sessions = [session("first", 1), session("second", 10), session("third", 25)];
    const numbered = withCurriculumNumbers(sessions);
    expect(numbered.map((item) => item.curriculumNumber)).toEqual([1, 2, 3]);
    expect(numbered.map((item) => item.sequenceNumber)).toEqual([1, 10, 25]);
    expect(numbered.map((item) => item.id)).toEqual(["first", "second", "third"]);
  });
});
