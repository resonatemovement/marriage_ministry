import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DashboardAttentionItem } from "@/features/dashboard/data";
import { AttentionPanel } from "./attention-panel";

const item = (id: string): DashboardAttentionItem => ({ id, category: "Intake Request", title: `Request ${id}`, detail: "Fremont", href: `/intake-requests/${id}` });

describe("Needs Attention carousel", () => {
  it("shows a clear empty state and View All when there are no items", () => {
    const markup = renderToStaticMarkup(createElement(AttentionPanel, { items: [] }));
    expect(markup).toContain("Nothing needs attention right now.");
    expect(markup).toContain('href="/dashboard/attention"');
    expect(markup).not.toContain("Next attention item");
  });

  it("shows one item without carousel arrows", () => {
    const markup = renderToStaticMarkup(createElement(AttentionPanel, { items: [item("1")] }));
    expect(markup).toContain("Request 1");
    expect(markup).not.toContain("Next attention item");
    expect(markup).not.toContain(" of 1");
  });

  it("shows manual previous/next controls and a position for multiple items", () => {
    const markup = renderToStaticMarkup(createElement(AttentionPanel, { items: [item("1"), item("2"), item("3")] }));
    expect(markup).toContain('aria-label="Previous attention item"');
    expect(markup).toContain('aria-label="Next attention item"');
    expect(markup).toContain("1 of 3");
    expect(markup).not.toContain("autoplay");
  });

  it("renders an unavailable state separately from an empty queue", () => {
    const markup = renderToStaticMarkup(createElement(AttentionPanel, { items: null, error: true }));
    expect(markup).toContain("Needs Attention is temporarily unavailable.");
    expect(markup).not.toContain("Nothing needs attention right now.");
  });
});
