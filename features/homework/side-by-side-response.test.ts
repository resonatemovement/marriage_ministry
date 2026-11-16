import { describe, expect, it } from "vitest";

import { parseSideBySideAnswerColumn, parseSideBySideResponseMetadata, sideBySideAnswerColumn, sideBySideAnswerRows, sideBySideResponseMetadata } from "./side-by-side-response";
import { homeworkSideBySideHeadingsAreValid, homeworkEditorStateFromRows, newHomeworkBlock } from "./homework-editor-model";

const groupId = "ab29786c-cc70-4b39-9f75-8640aa0872f7";
const rowA = "a555f2d8-84ce-44ca-9de8-2d6babaf994e";
const rowB = "b5edf42b-9646-41a9-9fc0-996e2a6833c4";

describe("Side-by-Side paired responses", () => {
  it("starts new headings empty and never uses placeholder copy as persisted values", () => {
    const block = newHomeworkBlock("side_by_side_response", 0);
    expect(block.sideBySideConfig).toMatchObject({ leftHeading: "", rightHeading: "" });
    expect(sideBySideResponseMetadata({ ...block.sideBySideConfig!, side: "left" })).not.toContain("Left column heading");
    expect(homeworkSideBySideHeadingsAreValid(homeworkEditorStateFromRows("draft", []))).toBe(true);
  });

  it.each([["", "Right"], ["Left", "   "], ["  ", " "]])("rejects missing or whitespace headings (%j)", (leftHeading, rightHeading) => {
    const block = newHomeworkBlock("side_by_side_response", 0);
    expect(homeworkSideBySideHeadingsAreValid({ versionId: "draft", versionStatus: "draft", blocks: [{ ...block, sideBySideConfig: { ...block.sideBySideConfig!, leftHeading, rightHeading } }], baseline: [], editingKey: block.key })).toBe(false);
  });

  it("round-trips independently stored columns with stable pair IDs and multiline text", () => {
    const rows = [
      { id: rowA, left: "First line\nsecond line", right: "Short" },
      { id: rowB, left: "A longer response\nwith several lines\nand detail", right: "Second column\nresponse" },
    ];
    const left = sideBySideAnswerColumn(rows, "left");
    const right = sideBySideAnswerColumn(rows, "right");
    expect(parseSideBySideAnswerColumn(left)).toEqual([{ id: rowA, value: rows[0]!.left }, { id: rowB, value: rows[1]!.left }]);
    expect(sideBySideAnswerRows(left, right, groupId)).toEqual(rows);
    expect(sideBySideAnswerRows(left, right, groupId).map(({ id }) => id)).toEqual([rowA, rowB]);
  });

  it("keeps existing published headings and legacy single responses readable", () => {
    const legacy = { groupId, instructions: "", leftHeading: "Saved left heading", rightHeading: "Saved right heading", bothRequired: true };
    const metadata = parseSideBySideResponseMetadata(sideBySideResponseMetadata({ ...legacy, side: "left" }));
    expect(metadata).toMatchObject(legacy);
    expect(sideBySideAnswerRows("Old left answer", "Old right answer", groupId)).toEqual([{ id: groupId, left: "Old left answer", right: "Old right answer" }]);
  });

  it("rejects malformed, duplicate, and mismatched row identifiers rather than silently dropping them", () => {
    expect(parseSideBySideAnswerColumn("not-json")).toBeNull();
    expect(parseSideBySideAnswerColumn(JSON.stringify({ version: 1, rows: [{ id: rowA, value: "x" }, { id: rowA, value: "y" }] }))).toBeNull();
    expect(sideBySideAnswerRows(sideBySideAnswerColumn([{ id: rowA, left: "left", right: "" }], "left"), sideBySideAnswerColumn([{ id: rowB, left: "", right: "right" }], "right"), groupId)).toMatchObject([
      { id: rowA, left: "left", right: "" }, { id: rowB, left: "", right: "right" },
    ]);
  });

  it("preserves malformed asymmetric stored text instead of silently dropping it", () => {
    const valid = sideBySideAnswerColumn([{ id: rowA, left: "captured text", right: "" }], "left");
    expect(sideBySideAnswerRows(valid, "{broken", groupId)).toEqual([{ id: groupId, left: valid, right: "{broken" }]);
  });
});
