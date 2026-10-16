import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/card", () => ({ Card: ({ children, className }: { children: ReactNode; className?: string }) => createElement("div", { className }, children) }));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DropdownMenuTrigger: ({ children, ...props }: { children: ReactNode }) => createElement("button", props, children),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DropdownMenuItem: ({ children, asChild, ...props }: { children: ReactNode; asChild?: boolean }) => { void asChild; return createElement("div", props, children); },
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SheetContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SheetDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
  SheetHeader: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SheetTitle: ({ children }: { children: ReactNode }) => createElement("h3", null, children),
}));
vi.mock("./detail-actions", () => ({ unassignCounselorOfRecord: vi.fn() }));

import { RelationshipCard } from "./relationship-card";
import { UnassignCounselorOfRecord } from "./unassign-counselor-of-record";

describe("RelationshipCard", () => {
  it("uses a CSS-only three-row scroll boundary with header and footer outside it", () => {
    const markup = renderToStaticMarkup(createElement(RelationshipCard, {
      title: "Coaches",
      rows: [{ id: "1", name: "Coach Team", metadata: "Coach · Fremont", href: "/people/1", action: createElement(UnassignCounselorOfRecord, { coupleId: "couple", coupleName: "Couple", teamName: "Coach Team" }) }],
      empty: "No coaches assigned.",
      footer: createElement("button", { type: "button" }, "Assign Coach"),
    }));

    expect(markup).toContain("max-h-[12rem] overflow-y-auto");
    expect(markup).toContain("h-[4rem]");
    expect(markup).toContain("More actions for Coach Team");
    expect(markup).toContain("View Details");
    expect(markup).toContain("Unassign");
    expect((markup.match(/lucide-user-minus/g) ?? []).length).toBe(1);
    expect(markup).toContain("variant=\"destructive\"");
    expect(markup).not.toContain("focus:ring-2");
    expect(markup).not.toContain("focus:ring");
    expect(markup).not.toContain("focus-visible:ring");
    expect(markup).toContain("focus:bg-surface-muted");
    expect(markup.indexOf("Coaches")).toBeLessThan(markup.indexOf("max-h-[12rem]"));
    expect(markup.indexOf("max-h-[12rem]")).toBeLessThan(markup.indexOf("Assign Coach"));
    expect(markup).not.toContain("max-h-72");
  });

  it("makes the entire direct-navigation row one accessible link with a decorative chevron", () => {
    const markup = renderToStaticMarkup(createElement(RelationshipCard, {
      title: "Coaches",
      rows: [
        { id: "coach-1", name: "DEV Test Coach Team Two", metadata: "Coach · Fremont", href: "/workspace/coaches/coach-1" },
        { id: "coach-2", name: "James & Gina Jacobs", metadata: "Coach · Fremont", href: "/workspace/coaches/coach-2" },
      ],
      empty: "No coaches assigned.",
      navigationMode: "chevron",
    }));

    const links = [...markup.matchAll(/<a href="(\/workspace\/coaches\/[^\"]+)" aria-label="([^"]+)" class="([^"]+)">([\s\S]*?)<\/a>/g)];
    expect(links).toHaveLength(2);
    expect(links[0]?.[1]).toBe("/workspace/coaches/coach-1");
    expect(links[0]?.[2]).toBe("View details for DEV Test Coach Team Two");
    expect(links[0]?.[3]).toContain("h-[4rem]");
    expect(links[1]?.[1]).toBe("/workspace/coaches/coach-2");
    expect(links[1]?.[2]).toBe("View details for James &amp; Gina Jacobs");
    expect(links[1]?.[3]).toContain("last:h-[5rem]");
    for (const link of links) {
      expect(link?.[3]).toContain("hover:bg-surface-muted");
      expect(link?.[3]).toContain("focus-visible:bg-sidebar-accent");
      expect(link?.[3]).toContain("px-4");
      expect(link?.[4]).toContain('class="flex h-[4rem] items-center gap-3"');
    }
    expect(links[0]?.[4]).toContain("DEV Test Coach Team Two");
    expect(links[0]?.[4]).toContain("Coach · Fremont");
    expect(links[0]?.[4]).toContain("lucide-chevron-right size-4");
    expect(links[0]?.[4]).toContain('aria-hidden="true"');
    expect(markup).not.toMatch(/after:|pointer-events-none|z-\d+/);
    expect(links[0]?.[3]).not.toMatch(/rounded|border-|shadow/);
    expect(markup).not.toContain("More actions for");
    expect(markup).not.toContain("View Details");
    expect(markup).not.toContain("lucide-ellipsis-vertical");
    expect(markup).not.toContain("tabIndex");
  });
});
