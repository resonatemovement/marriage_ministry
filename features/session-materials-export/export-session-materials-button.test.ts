import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ExportSessionMaterialsButton } from "./export-session-materials-button";

describe("Session Materials PDF actions", () => {
  it("renders a secondary Preview PDF action and a primary Download PDF action", () => {
    const markup = renderToStaticMarkup(createElement(ExportSessionMaterialsButton, { caseSessionId: "case-session-1", sessionLabel: "Session 2: Communication" }));
    expect(markup).toContain('data-pdf-action="preview"');
    expect(markup).toContain('data-pdf-action="download"');
    expect(markup).toContain("Preview PDF");
    expect(markup).toContain("Download PDF");
    expect(markup).toContain("border-border bg-surface");
    expect(markup).toContain("bg-brand-primary");
    expect(markup).toContain("aria-busy=\"false\"");
    expect(markup).toContain('aria-label="Preview PDF for Session 2: Communication"');
    expect(markup).toContain('aria-label="Download PDF for Session 2: Communication"');
    expect(markup.match(/w-\[168px\]/g)).toHaveLength(2);
    expect(markup.match(/whitespace-nowrap/g)).toHaveLength(2);
    expect(markup.match(/shrink-0/g)).toHaveLength(2);
    expect(markup.match(/<svg\b/g)).toHaveLength(2);
  });

  it("preserves the user-initiated preview tab and downloads the returned server filename without page navigation", () => {
    const source = readFileSync("features/session-materials-export/export-session-materials-button.tsx", "utf8");
    expect(source).toContain('window.open("about:blank", "_blank")');
    expect(source).toContain('mode === "download" ? "?download=1" : ""');
    expect(source).toContain("filenameFromContentDisposition(response.headers.get(\"content-disposition\"))");
    expect(source).toContain("link.download = filename;");
    expect(source).toContain("link.click()");
    expect(source).toContain("if (lock.current) return;");
    expect(source).toContain('showErrorToast("Session Materials PDF could not be prepared. Please try again.")');
    expect(source).toContain("disabled={pending !== null}");
  });
});
