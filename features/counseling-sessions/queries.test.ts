import { describe, expect, it } from "vitest";

import { counselingSessionQueryFailure } from "./query-diagnostics";

describe("Counseling Sessions query diagnostics", () => {
  it("identifies the failing data source without exposing it to the browser", () => {
    expect(counselingSessionQueryFailure({ error: null }, { error: null }, { error: null }, { error: null }, { error: { code: "42P17", message: "infinite recursion" } }, { error: null })).toEqual({ query: "assignmentsResult", code: "42P17", message: "infinite recursion" });
  });

  it("identifies a failed case-scoped Couple identity projection", () => {
    expect(counselingSessionQueryFailure({ error: null }, { error: null }, { error: null }, { error: null }, { error: null }, { error: { code: "42501", message: "permission denied" } })).toEqual({ query: "identityResult", code: "42501", message: "permission denied" });
  });
});
