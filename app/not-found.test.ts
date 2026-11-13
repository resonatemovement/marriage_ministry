import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import NotFound from "./not-found";

describe("global not-found page", () => {
  it("renders Resonate branding and the approved missing-page guidance", () => {
    const markup = renderToStaticMarkup(createElement(NotFound));

    expect(markup).toContain("Resonate");
    expect(markup).toContain("Page not found");
    expect(markup).toContain("We couldn&#x27;t find the page you&#x27;re looking for. The link may be incorrect or no longer available.");
    expect(markup).toContain("px-4 py-12");
    expect(markup).toContain("sm:px-6");
  });

  it("returns to the safe public home route without routing to login", () => {
    const markup = renderToStaticMarkup(createElement(NotFound));

    expect(markup).toContain('href="/"');
    expect(markup).toContain("Return to Marriage Ministry");
    expect(markup).not.toContain('href="/login"');
  });
});
