import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthoringSectionHeader } from "./authoring-section-header";

describe("authoring section header", () => {
  it.each([
    ["Session Material", "Build and organize the material participants will use."],
    ["Homework", "Build the homework participants will complete for this Session."],
  ])("renders the shared %s title, description, and action layout", (title, description) => {
    const markup = renderToStaticMarkup(createElement(AuthoringSectionHeader, {
      headingId: "authoring-heading",
      title,
      description,
      action: createElement("button", null, "Add Content"),
    }));
    expect(markup).toContain("id=\"authoring-heading\"");
    expect(markup).toContain(title);
    expect(markup).toContain(description);
    expect(markup).toContain("Add Content");
  });
});
