import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ reservePrepareEnrichUpload: vi.fn(), finishPrepareEnrichUpload: vi.fn() }));

import { PrepareEnrichAdminManager } from "./admin-manager";

describe("Prepare & Enrich Admin manager", () => {
  it("renders exactly two case-document slots and presents replacement for an occupied slot", () => {
    const markup = renderToStaticMarkup(createElement(PrepareEnrichAdminManager, {
      coupleGroupId: "couple-1", counselingCaseId: "case-1",
      documents: [{ id: "document-1", slot: "counselor", fileName: "counselor.pdf", contentType: "application/pdf", sizeBytes: 10 }],
    }));
    expect(markup).toContain("Prepare &amp; Enrich");
    expect((markup.match(/Counselor Version/g) ?? [])).toHaveLength(1);
    expect((markup.match(/Couple Version/g) ?? [])).toHaveLength(1);
    expect(markup).toContain("counselor.pdf");
    expect(markup).toContain(">Replace<");
    expect(markup).toContain(">Upload<");
    expect(markup).not.toContain("Version history");
  });
});
