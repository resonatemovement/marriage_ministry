import { describe, expect, it } from "vitest";
import type { SessionContentOption } from "./model";
import { recommendedSessionContentIds, toggleSessionContentId } from "./session-content-selection";

const content: SessionContentOption[] = [
  { id: "page-one", blockType: "rich_text", position: 0, label: "Welcome", resourceCategory: null, isRecommended: true },
  { id: "resource-one", blockType: "library_resource", position: 1, label: "Guide", resourceCategory: "document", isRecommended: false },
  { id: "page-two", blockType: "rich_text", position: 2, label: "Practice", resourceCategory: null, isRecommended: true },
];

describe("selective Session content state", () => {
  it("starts and restores from Admin recommendations in authored order", () => {
    expect(recommendedSessionContentIds(content)).toEqual(["page-one", "page-two"]);
  });

  it("preserves an intentional zero-default selection", () => {
    expect(recommendedSessionContentIds(content.map((item) => ({ ...item, isRecommended: false })))).toEqual([]);
  });

  it("adds, removes, and de-duplicates selected stable block IDs", () => {
    expect(toggleSessionContentId(["page-one"], "resource-one", true)).toEqual(["page-one", "resource-one"]);
    expect(toggleSessionContentId(["page-one", "resource-one"], "page-one", false)).toEqual(["resource-one"]);
    expect(toggleSessionContentId(["page-one"], "page-one", true)).toEqual(["page-one"]);
  });
});
