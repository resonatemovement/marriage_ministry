import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }));
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
});
