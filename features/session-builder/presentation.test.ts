import { describe, expect, it } from "vitest";

import { withAuthoredSessionNumbers, withCurriculumNumbers } from "./presentation";
import type { SessionSummary } from "./types";

function session(id: string, sequenceNumber: number): SessionSummary {
  return { id, sequenceNumber, curriculumNumber: 0, title: id, status: "draft", isFinal: false, updatedAt: "" };
}

describe("Session curriculum numbering", () => {
  it("derives contiguous display numbers without changing database sequence values or order", () => {
    const sessions = [session("first", 1), session("second", 10), session("third", 25)];
    const numbered = withCurriculumNumbers(sessions);
    expect(numbered.map((item) => item.curriculumNumber)).toEqual([1, 2, 3]);
    expect(numbered.map((item) => item.sequenceNumber)).toEqual([1, 10, 25]);
    expect(numbered.map((item) => item.id)).toEqual(["first", "second", "third"]);
  });

  it("establishes authored rank in canonical sequence order before callers filter by status", () => {
    const numbered = withAuthoredSessionNumbers([
      { id: "published", sequenceNumber: 10, status: "published" },
      { id: "draft", sequenceNumber: 1, status: "draft" },
    ]);

    expect(numbered.map(({ id, authoredSessionNumber }) => [id, authoredSessionNumber])).toEqual([
      ["draft", 1],
      ["published", 2],
    ]);
    expect(numbered.filter(({ status }) => status === "published")[0]?.authoredSessionNumber).toBe(2);
  });
});
