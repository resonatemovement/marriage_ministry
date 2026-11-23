import { describe, expect, it } from "vitest";
import { counselingSessionsGridClassName, counselingSessionsOversightCardsGridClassName, counselingSessionsOversightGridClassName, counselingSessionsRailClassName, sessionCardContainerClassName, sessionCardNavigationClassName } from "./presentation";

describe("Counseling Workspace presentation", () => {
  it("keeps the hierarchy rail separate from equal-height Couple card rows", () => {
    expect(counselingSessionsOversightGridClassName).toContain("md:grid-cols-[minmax(0,1fr)_17rem]");
    expect(counselingSessionsOversightCardsGridClassName).toContain("auto-rows-fr");
    expect(counselingSessionsOversightCardsGridClassName).toContain("items-stretch");
    expect(counselingSessionsOversightCardsGridClassName).toContain("xl:grid-cols-2");
    expect(counselingSessionsRailClassName).toContain("min-w-0");
    expect(counselingSessionsGridClassName).toContain("mt-4");
  });

  it("keeps the Counselor-only Session grid unchanged", () => {
    expect(counselingSessionsGridClassName).toContain("sm:grid-cols-2");
    expect(counselingSessionsGridClassName).not.toContain("grid-cols-3");
    expect(counselingSessionsGridClassName).toContain("auto-rows-fr");
    expect(counselingSessionsGridClassName).toContain("items-stretch");
  });

  it("gives clickable Session cards a restrained hover and clear keyboard focus state", () => {
    expect(sessionCardContainerClassName).toContain("has-[>a:hover]:-translate-y-px");
    expect(sessionCardContainerClassName).toContain("has-[>a:hover]:border-brand-primary/35");
    expect(sessionCardContainerClassName).toContain("has-[>a:hover]:shadow-");
    expect(sessionCardNavigationClassName).toContain("hover:bg-info-soft/35");
    expect(sessionCardContainerClassName).toContain("has-[>a:focus-visible]:ring-2");
    expect(sessionCardNavigationClassName).toContain("focus-visible:bg-info-soft/45");
  });

});
