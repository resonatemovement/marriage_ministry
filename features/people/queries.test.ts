import { describe, expect, it } from "vitest";

import { peopleGroupSelection, peopleProfileSelection } from "./selections";
import { coupleDisplayName, matchesPeopleFilter, normalizePeopleFilter, type PeopleRecord } from "./types";

describe("People query selections", () => {
  it("uses the profile-role foreign key rather than an ambiguous embedded relationship", () => {
    const profileRolesRelationship = "profile_roles!profile_roles_profile_id_fkey(role)";

    expect(peopleGroupSelection).toContain(profileRolesRelationship);
    expect(peopleProfileSelection).toContain(profileRolesRelationship);
  });
});

describe("People filters", () => {
  const records: PeopleRecord[] = [
    { id: "couple", name: "Couple", type: "couples", roles: [], campus: null, counselingStatus: null, assignedTo: null, updatedAt: "2026-01-01", searchText: "couple" },
    { id: "coach", name: "Coach", type: "coaches", roles: [], campus: null, counselingStatus: null, assignedTo: null, updatedAt: "2026-01-01", searchText: "coach" },
    { id: "counselor", name: "Counselor", type: "counselors", roles: [], campus: null, counselingStatus: null, assignedTo: null, updatedAt: "2026-01-01", searchText: "counselor" },
    { id: "admin", name: "Admin", type: "admins", roles: ["admin"], campus: null, counselingStatus: null, assignedTo: null, updatedAt: "2026-01-01", searchText: "admin" },
    { id: "author", name: "Author", type: "authors", roles: ["author"], campus: null, counselingStatus: null, assignedTo: null, updatedAt: "2026-01-01", searchText: "author" },
  ];

  it.each([
    ["all", ["couple", "coach", "counselor", "admin", "author"]],
    ["couples", ["couple"]],
    ["coaches", ["coach"]],
    ["counselors", ["counselor"]],
    ["admins", ["admin"]],
    ["authors", ["author"]],
  ] as const)("filters %s by canonical record type", (filter, expectedIds) => {
    expect(records.filter((record) => matchesPeopleFilter(record, filter)).map((record) => record.id)).toEqual(expectedIds);
  });

  it("normalizes unsupported filter values to All", () => {
    expect(normalizePeopleFilter("teams")).toBe("all");
    expect(normalizePeopleFilter(undefined)).toBe("all");
  });
});

describe("Couple display names", () => {
  it("uses both pending invitation names", () => {
    expect(coupleDisplayName("Pending Couple invitation", [], [
      { firstName: "John", lastName: "Walker", email: "john@example.com" },
      { firstName: "Lindsey", lastName: "Walker", email: "lindsey@example.com" },
    ])).toBe("John Walker & Lindsey Walker");
  });

  it("combines an onboarded profile with a pending invitation", () => {
    expect(coupleDisplayName("Pending Couple invitation", [
      { firstName: "John", lastName: "Walker", email: "john@example.com" },
    ], [
      { firstName: "Lindsey", lastName: "Walker", email: "lindsey@example.com" },
    ])).toBe("John Walker & Lindsey Walker");
  });

  it("prefers full profile names and avoids duplicate members", () => {
    expect(coupleDisplayName("Pending Couple invitation", [
      { firstName: "John", lastName: "Walker", email: "john@example.com" },
      { firstName: "Lindsey", lastName: "Walker", email: "lindsey@example.com" },
    ], [{ firstName: "John", lastName: "Walker", email: "john@example.com" }])).toBe("John Walker & Lindsey Walker");
  });

  it("falls back when no usable names exist", () => {
    expect(coupleDisplayName("Pending Couple invitation", [], [])).toBe("Pending Couple invitation");
    expect(coupleDisplayName("Walker Couple", [], [])).toBe("Walker Couple");
  });
});
