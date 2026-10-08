import { describe, expect, it } from "vitest";
import { campusLeadCoachRows, counselingCoachDetailHref } from "./workspace-presentation";
import { counselingSessionsContentClassName, counselingSessionsGridClassName, counselingSessionsHeaderClassName, counselingSessionsRailClassName, counselingSessionsWorkspaceClassName, sessionCardContainerClassName, sessionCardNavigationClassName } from "./presentation";

describe("Counseling Workspace presentation", () => {
  it("aligns the Coaches rail with the Session cards on desktop and stacks it after content on smaller screens", () => {
    expect(counselingSessionsWorkspaceClassName).toContain("xl:grid-cols-[minmax(0,1fr)_280px]");
    expect(counselingSessionsWorkspaceClassName).toContain("gap-y-4");
    expect(counselingSessionsHeaderClassName).toContain("xl:row-start-1");
    expect(counselingSessionsRailClassName).toContain("xl:row-start-2");
    expect(counselingSessionsRailClassName).toContain("order-3");
    expect(counselingSessionsContentClassName).toContain("xl:row-start-2");
    expect(counselingSessionsGridClassName).toContain("mt-4");
  });

  it("allows at most two spacious Session cards in the main column", () => {
    expect(counselingSessionsGridClassName).toContain("sm:grid-cols-2");
    expect(counselingSessionsGridClassName).not.toContain("grid-cols-3");
  });

  it("gives clickable Session cards a restrained hover and clear keyboard focus state", () => {
    expect(sessionCardContainerClassName).toContain("has-[>a:hover]:-translate-y-px");
    expect(sessionCardContainerClassName).toContain("has-[>a:hover]:border-brand-primary/35");
    expect(sessionCardContainerClassName).toContain("has-[>a:hover]:shadow-");
    expect(sessionCardNavigationClassName).toContain("hover:bg-info-soft/35");
    expect(sessionCardContainerClassName).toContain("has-[>a:focus-visible]:ring-2");
    expect(sessionCardNavigationClassName).toContain("focus-visible:bg-info-soft/45");
  });

  it("renders only the supplied Campus Lead Coach assignments without Admin controls", () => {
    expect(counselingCoachDetailHref("coach-a")).toBe("/workspace/coaches/coach-a");
    const rows = campusLeadCoachRows([
      { id: "coach-a", name: "Fremont Coaches", campus: "Fremont" },
      { id: "coach-b", name: "Oakland Coaches", campus: null },
    ]);
    expect(rows).toEqual([
      { id: "coach-a", name: "Fremont Coaches", metadata: "Coach · Fremont", href: "/workspace/coaches/coach-a" },
      { id: "coach-b", name: "Oakland Coaches", metadata: "Coach · Campus not assigned", href: "/workspace/coaches/coach-b" },
    ]);
    expect(JSON.stringify(rows)).not.toContain("Assign Coach");
    expect(JSON.stringify(rows)).not.toContain("No eligible coaches are available");
  });
});
