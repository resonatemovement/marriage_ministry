import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canBrowseResources, canManageResource, RESOURCE_POLICY, resourcePruningCandidates, sanitizeResourceFilename, validateResourceFile, validateResourceMetadata, type ResourceCategory } from "./policy";

describe("Resource file policy", () => {
  for (const [category, rule] of Object.entries(RESOURCE_POLICY.categories)) {
    for (const mimeType of rule.mimeTypes) {
      it(`accepts ${mimeType} as ${category} independently of filename extension`, () => {
        expect(validateResourceFile({ category: category as ResourceCategory, mimeType, sizeBytes: rule.maxBytes, originalFilename: "original.unknown" })).toBeTruthy();
      });
    }
    it(`enforces ${category} size boundaries`, () => {
      for (const sizeBytes of [0, -1, 0.5, NaN, Infinity, rule.maxBytes + 1]) {
        expect(() => validateResourceFile({ category: category as ResourceCategory, mimeType: rule.mimeTypes[0], sizeBytes, originalFilename: "file" })).toThrow();
      }
    });
  }
  it("rejects filename-only acceptance and category mismatch", () => {
    for (const mimeType of ["application/octet-stream", "image/svg+xml", "application/pdf"]) {
      expect(() => validateResourceFile({ category: "image", mimeType, sizeBytes: 1, originalFilename: "image.png" })).toThrow();
    }
  });
  it("rejects malformed filenames", () => {
    for (const originalFilename of [" ", "a\u0000.png", "x".repeat(256)]) {
      expect(() => validateResourceFile({ category: "image", mimeType: "image/png", sizeBytes: 1, originalFilename })).toThrow();
    }
  });
  it("sanitizes object filenames without changing original metadata", () => {
    expect(sanitizeResourceFilename("../Résumé image.png")).toBe("_Re_sume__image.png");
    expect(sanitizeResourceFilename("...")).toBe("file");
    expect(sanitizeResourceFilename("a".repeat(200))).toHaveLength(160);
  });
  it("validates metadata", () => {
    expect(validateResourceMetadata({ title: " Example ", description: " " })).toEqual({ title: "Example", description: null });
    for (const title of ["", "x".repeat(181)]) expect(() => validateResourceMetadata({ title })).toThrow();
    expect(() => validateResourceMetadata({ title: "Example", description: "x".repeat(4001) })).toThrow();
  });
  it("keeps the DB/bucket enforcement snapshot aligned with centralized application limits/MIMEs", () => {
    const migration = readFileSync("supabase/migrations/20260929152032_resource_library_schema.sql", "utf8");
    for (const [category, rule] of Object.entries(RESOURCE_POLICY.categories)) {
      expect(migration).toContain(`when '${category}' then bytes <= ${rule.maxBytes}`);
      expect(migration).toContain(`when '${category}' then bytes <= ${rule.maxBytes} and mime = any(array[${rule.mimeTypes.map(mime => `'${mime}'`).join(",")}])`);
    }
    expect(migration).toContain(`false,${RESOURCE_POLICY.categories.video.maxBytes}`);
  });
});

describe("Resource permissions and retention", () => {
  const owner = { id: "owner", roles: ["author"] as const };
  const resource = { created_by: "owner", archived_at: null };
  it("allows authors to browse but only manage their active own resources", () => {
    expect(canBrowseResources(owner)).toBe(true);
    expect(canManageResource(owner, resource)).toBe(true);
    expect(canManageResource({ ...owner, id: "other" }, resource)).toBe(false);
    expect(canManageResource(owner, { ...resource, archived_at: "now" })).toBe(false);
  });
  it("allows both administrative roles independent of workspace and ownership", () => {
    for (const role of ["super_admin", "admin"] as const) {
      expect(canManageResource({ id: "other", roles: [role] }, { ...resource, archived_at: "now" })).toBe(true);
    }
    expect(canBrowseResources({ id: "owner", roles: ["campus_lead", "coach"] })).toBe(false);
    expect(canManageResource({ id: "owner", roles: ["couple"] }, resource)).toBe(false);
  });
  it("retains current plus newest three previous and protects older pinned candidates", () => {
    const versions = Array.from({ length: 7 }, (_, i) => ({ id: `${i+1}`, version_number: i+1 }));
    expect(RESOURCE_POLICY.previousVersions).toBe(3);
    expect(resourcePruningCandidates(versions, "7").map(v => v.id)).toEqual(["3", "2", "1"]);
    expect(resourcePruningCandidates(versions, "7", new Set(["2"])).map(v => v.id)).toEqual(["3", "1"]);
    expect(versions[0].id).toBe("1");
    expect(resourcePruningCandidates(versions.slice(0, 3), "3")).toEqual([]);
  });
});
