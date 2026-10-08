import { describe, expect, it } from "vitest";

import { PREPARE_ENRICH_BUCKET, PREPARE_ENRICH_SLOTS, isPrepareEnrichSlot } from "./model";

describe("Prepare & Enrich document model", () => {
  it("defines exactly the separate Counselor and Couple document slots", () => {
    expect(PREPARE_ENRICH_BUCKET).toBe("assessment-documents");
    expect(PREPARE_ENRICH_SLOTS).toEqual(["counselor", "couple"]);
    expect(isPrepareEnrichSlot("counselor")).toBe(true);
    expect(isPrepareEnrichSlot("couple")).toBe(true);
    expect(isPrepareEnrichSlot("coach")).toBe(false);
  });
});
