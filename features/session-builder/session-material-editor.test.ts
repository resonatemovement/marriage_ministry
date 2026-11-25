import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./resource-actions", () => ({ refreshSessionResourceAccess: vi.fn(), findSessionResources: vi.fn() }));

import { newStagedBlock } from "./editor-model";
import { SessionMaterialForm } from "./session-material-editor";

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
