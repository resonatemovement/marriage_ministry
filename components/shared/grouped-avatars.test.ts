import { createElement, type ImgHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: ({ unoptimized, ...props }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
  void unoptimized;
  return createElement("img", props);
} }));

import { GroupedAvatars } from "./grouped-avatars";

describe("GroupedAvatars", () => {
  it("overlaps multiple circular avatars with consistent separation and stacking", () => {
    const markup = renderToStaticMarkup(createElement(GroupedAvatars, {
      label: "Partner photos",
      people: [{ id: "one", name: "One", photoUrl: "https://example.test/one.avif" }, { id: "two", name: "Two", photoUrl: null }],
    }));
    expect(markup).toContain("-space-x-3");
    expect(markup.match(/size-16/g)).toHaveLength(2);
    expect(markup.match(/border-2 border-white/g)).toHaveLength(2);
    expect(markup).toContain("z-index:1");
    expect(markup).toContain("z-index:2");
    expect(markup).toContain("Two profile placeholder");
  });

  it("keeps a single avatar unstacked", () => {
    const markup = renderToStaticMarkup(createElement(GroupedAvatars, {
      label: "Profile photo",
      people: [{ id: "one", name: "One", photoUrl: null }],
    }));
    expect(markup).not.toContain("-space-x-3");
    expect(markup.match(/size-16/g)).toHaveLength(1);
  });
});
