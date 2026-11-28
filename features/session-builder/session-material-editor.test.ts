import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./resource-actions", () => ({ refreshSessionResourceAccess: vi.fn(), findSessionResources: vi.fn() }));
vi.mock("./move-content-actions", () => ({
  getHomeworkMoveDestination: vi.fn(),
  moveSessionBuilderContent: vi.fn(),
}));

import { newStagedBlock, type StagedMaterialBlock } from "./editor-model";
import { SessionMaterialEditor, SessionMaterialForm } from "./session-material-editor";

const meaningfulContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "test" }] }],
};

function renderForm(title: string, richTextContent: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(SessionMaterialForm, {
    block: { ...newStagedBlock("rich_text"), title, richTextContent },
    patch: vi.fn(),
    done: vi.fn(),
    message: null,
    showCancel: false,
    cancel: vi.fn(),
    chooseResource: vi.fn(),
  }));
}

describe("Session Material Rich Text authoring", () => {
  it("renders an optional title and enables the real Done editing control for a blank title and valid body", () => {
    const markup = renderForm("", meaningfulContent);

    expect(markup).toContain("Title (optional)");
    expect(markup).toContain('value=""');
    expect(markup).toContain("Done editing</button>");
    expect(markup).not.toContain("disabled=");
  });

  it("allows clearing an existing title while still requiring meaningful Rich Text content", () => {
    const clearedTitle = renderForm("", meaningfulContent);
    const emptyBody = renderForm("", { type: "doc", content: [{ type: "paragraph" }] });
    const titledBlock = renderForm("Existing title", meaningfulContent);

    expect(clearedTitle).toContain('value=""');
    expect(clearedTitle).not.toContain("disabled=");
    expect(emptyBody).toContain("disabled=");
    expect(titledBlock).toContain("Existing title");
    expect(titledBlock).not.toContain("disabled=");
  });
});

describe("Session Material Builder rows", () => {
  it("places a wrapping PAGE heading and controls above the white preview on desktop and mobile", () => {
    const longTitle = "Praying Together as a Couple Through Every Season";
    const page: StagedMaterialBlock = {
      ...newStagedBlock("rich_text"), key: "page-one", title: longTitle, richTextContent: meaningfulContent, isRecommended: true,
    };
    const video: StagedMaterialBlock = {
      ...newStagedBlock("video_link"), key: "video-one", title: "Watch together", url: "https://example.com/video", description: "Discuss this resource.",
    };
    const markup = renderToStaticMarkup(createElement(SessionMaterialEditor, {
      blocks: [page, video], archived: false, canManageRecommendations: true, updateBlocks: vi.fn(),
    }));

    const header = markup.indexOf('<header class="grid min-w-0 gap-2 sm:flex sm:items-center sm:justify-between">');
    const heading = markup.indexOf(`Page 1: ${longTitle}`);
    const include = markup.indexOf("Include by Default");
    const edit = markup.indexOf(">Edit</button>");
    const menu = markup.indexOf('aria-label="Material actions"');
    const preview = markup.indexOf('class="min-w-0 rounded-md border border-border bg-white p-4"');
    const pageCardEnd = markup.indexOf("Resources", preview);
    expect(header).toBeGreaterThanOrEqual(0);
    expect(heading).toBeGreaterThan(header);
    expect(include).toBeGreaterThan(heading);
    expect(edit).toBeGreaterThan(include);
    expect(menu).toBeGreaterThan(edit);
    expect(preview).toBeGreaterThan(menu);
    expect(pageCardEnd).toBeGreaterThan(preview);
    expect(markup.slice(header, preview)).toContain("break-words");
    expect(markup.slice(header, preview)).toContain("sm:flex sm:items-center sm:justify-between");
    expect(markup.slice(header, preview)).toContain("flex min-w-0 flex-wrap items-center justify-between gap-2 sm:shrink-0 sm:justify-end");
    expect(markup.slice(preview, pageCardEnd)).not.toContain("Praying Together as a Couple Through Every Season");
    expect(markup.slice(preview, pageCardEnd)).toContain(">test</p>");
    expect(markup.slice(preview, pageCardEnd)).toContain("line-clamp-2");
    expect(markup.slice(preview, pageCardEnd)).not.toContain("Include by Default");
    expect(markup.slice(preview, pageCardEnd)).not.toContain('aria-label="Material actions"');
    expect(markup.match(/Include by Default/g)).toHaveLength(2);
    expect(markup.match(/aria-label="Material actions"/g)).toHaveLength(2);
    expect(markup).toContain("Watch together");
    expect(markup).toContain("sm:gap-3");
  });
});
