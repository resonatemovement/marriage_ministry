import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PeoplePage } from "./people-page";
import type { PeopleRecord } from "./types";

const record: PeopleRecord = {
  id: "couple-id",
  name: "Jordan Lee & Casey Lee",
  type: "couples",
  roles: ["couple"],
  campus: "Fremont",
  status: "Unassigned · Interviewed",
  caseStatus: "interviewed",
  assignedTo: null,
  active: true,
  unassigned: true,
  updatedAt: "2026-11-01T00:00:00Z",
  searchText: "jordan lee casey lee",
  couplePartners: [{ id: "partner-one", name: "Jordan Lee", photoUrl: "https://photos.example.test/jordan" }],
};

describe("Admin filtered Couple list", () => {
  it("preserves the selected filter in search, status navigation, and Couple details", () => {
    const markup = renderToStaticMarkup(createElement(PeoplePage, {
      records: [record], filter: "couples", search: "Jordan", caseListStatus: "unassigned",
      returnTo: "/people?filter=couples&q=Jordan&caseStatus=unassigned",
    }));

    expect(markup).toContain("Back to Admin Workspace");
    expect(markup).toContain('name="caseStatus" value="unassigned"');
    expect(markup).toContain('href="/people?filter=couples&amp;q=Jordan&amp;caseStatus=interviewed"');
    expect(markup).toContain('href="/people/couple-id?returnTo=');
    expect(markup).toContain("Unassigned · Interviewed");
    expect(markup).toContain("https://photos.example.test/jordan");
  });

  it("shows an explicit empty state for a zero-result status filter", () => {
    const markup = renderToStaticMarkup(createElement(PeoplePage, {
      records: [], filter: "couples", search: "", caseListStatus: "pending_final", returnTo: "/people?filter=couples&caseStatus=pending_final",
    }));
    expect(markup).toContain("No matching Couples");
    expect(markup).toContain("active Couple records for this filter");
  });
});
