import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CoupleSessionReview } from "./session-review";

describe("completed Couple Session review", () => {
  it("lists assigned snapshots in journey order and links to the existing Session View", () => {
    const html = renderToStaticMarkup(createElement(CoupleSessionReview, { data: { sessions: [
      { id: "case-session-one", actualSequence: 1, number: 1, title: "testing", status: "completed" },
      { id: "case-session-two", actualSequence: 2, number: 2, title: "new session", status: "completed" },
    ] } }));
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('href="/workspace">Workspace</a>');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Your Sessions");
    expect(html.indexOf("Session 1: testing")).toBeLessThan(html.indexOf("Session 2: new session"));
    expect(html.match(/>Completed<\/span>/g)).toHaveLength(2);
    expect(html).toContain('href="/workspace/sessions/case-session-one"');
    expect(html).toContain('href="/workspace/sessions/case-session-two"');
    expect(html.match(/View Session/g)).toHaveLength(2);
  });

  it("keeps the review route Couple-only and reuses the existing snapshot reader route", () => {
    const reviewRoute = readFileSync("app/workspace/sessions/page.tsx", "utf8");
    const sessionRoute = readFileSync("app/workspace/sessions/[caseSessionId]/page.tsx", "utf8");
    expect(reviewRoute).toContain('identity.roles.includes("couple")');
    expect(reviewRoute).toContain("getCompletedCoupleSessionReview()");
    expect(reviewRoute).toContain("<CoupleSessionReview data={data}");
    expect(sessionRoute).toContain("getCoupleSessionViewData(identity.id, caseSessionId)");
    expect(sessionRoute).toContain("<CoupleSessionView key={");
    expect(sessionRoute).toContain("session={session}");
  });
});
