import { describe, expect, it } from "vitest";

import { buildPeopleBreadcrumbs, parsePeopleTrail, peopleDetailHref } from "./breadcrumbs";

const detail = (id: string, name: string) => ({ id, name } as never);

describe("People navigation breadcrumbs", () => {
  it("uses a canonical direct-entry fallback", () => {
    expect(buildPeopleBreadcrumbs(detail("11111111-1111-1111-1111-111111111111", "Couple"), [], [])).toEqual([{ label: "People & Teams", href: "/people" }, { label: "Couple" }]);
  });

  it("preserves only the actual drill-down trail", () => {
    const trail = ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"];
    const items = buildPeopleBreadcrumbs(detail("33333333-3333-3333-3333-333333333333", "Couple"), [detail(trail[0]!, "Campus Lead"), detail(trail[1]!, "Coach")], trail);
    expect(items.map((item) => item.label)).toEqual(["People & Teams", "Campus Lead", "Coach", "Couple"]);
    expect(peopleDetailHref(trail[1]!, trail)).toContain("trail=11111111-1111-1111-1111-111111111111%2C22222222-2222-2222-2222-222222222222");
  });

  it("drops malformed, duplicated, and current ids safely", () => {
    const current = "33333333-3333-3333-3333-333333333333";
    expect(parsePeopleTrail(`bad,${current},11111111-1111-1111-1111-111111111111,11111111-1111-1111-1111-111111111111`, current)).toEqual(["11111111-1111-1111-1111-111111111111"]);
  });
});
