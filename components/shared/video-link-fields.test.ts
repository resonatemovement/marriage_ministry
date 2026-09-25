import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { VideoLinkFields } from "./video-link-fields";

describe("VideoLinkFields presentation", () => {
  it("renders the common fields and accessible URL error association", () => {
    const onChange = vi.fn();
    const markup = renderToStaticMarkup(createElement(VideoLinkFields, {
      title: "Watch",
      url: "https://example.com/video",
      description: "A short description",
      onTitleChange: onChange,
      onUrlChange: onChange,
      onDescriptionChange: onChange,
      urlError: "Enter a valid URL.",
    }));
    expect(markup).toContain("Title");
    expect(markup).toContain("URL");
    expect(markup).toContain("Description");
    expect(markup).toContain("aria-invalid=\"true\"");
    expect(markup).toContain("role=\"alert\"");
    expect(markup).toContain("aria-describedby=");
  });
});
