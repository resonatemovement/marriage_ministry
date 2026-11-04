import { describe, expect, it } from "vitest";
import { counselingSessionsGridClassName, counselingSessionsOversightGridClassName, counselingSessionsRailClassName, sessionCardContainerClassName, sessionCardNavigationClassName } from "./presentation";

describe("Counseling Workspace presentation", () => {
  it("uses one or two equal columns based on Couple count, then adds a third at wide desktop", () => {
    for (const count of [0, 1]) {
      const className = counselingSessionsOversightGridClassName(count);
      expect(className).toContain("grid-cols-1");
      expect(className).toContain("md:grid-cols-2");
      expect(className).toContain("xl:grid-cols-2");
      expect(className).toContain("items-start");
    }
    for (const count of [2, 3, 5]) {
      const className = counselingSessionsOversightGridClassName(count);
      expect(className).toContain("md:grid-cols-2");
      expect(className).toContain("xl:grid-cols-3");
      expect(className).toContain("items-start");
    }
    expect(counselingSessionsRailClassName(1)).toContain("self-start");
    expect(counselingSessionsRailClassName(1)).toContain("min-w-0");
    expect(counselingSessionsRailClassName(2)).toContain("md:col-start-2 md:row-start-1");
    expect(counselingSessionsRailClassName(2)).toContain("xl:col-start-3 xl:row-start-1");
    expect(counselingSessionsGridClassName).toContain("mt-4");
  });

  it("keeps the Counselor-only Session grid unchanged", () => {
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

});
