import { describe, expect, it } from "vitest";

import { buildPeopleBreadcrumbs, parsePeopleTrail, peopleDetailHref, peopleListDetailHref, peopleListHref, validatePeopleReturnTo } from "./breadcrumbs";

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

  it.each(["campus_leads", "coaches", "counselors", "couples"])("preserves the %s list filter in detail navigation", (filter) => {
    const list = peopleListHref(filter, "");
    expect(peopleListDetailHref("11111111-1111-1111-1111-111111111111", list)).toContain(`returnTo=${encodeURIComponent(list)}`);
  });

  it("preserves search and multiple People list parameters", () => {
    const list = peopleListHref("coaches", "James Smith");
    expect(list).toBe("/people?filter=coaches&q=James+Smith");
    expect(validatePeopleReturnTo(list)).toBe(list);
  });

  it.each([undefined, "not a url", "https://example.com/", "//example.com/", "/admin", "/peoplex", "/people?filter=coaches#details"]) ("falls back safely for invalid returnTo %s", (value) => {
    expect(validatePeopleReturnTo(value)).toBe("/people");
  });

  it("accepts a People URL with its query string", () => {
    expect(validatePeopleReturnTo("/people?filter=counselors&q=casey")).toBe("/people?filter=counselors&q=casey");
  });
});
