import { describe, expect, it } from "vitest";

import { realtimeFixtureGroupName, requiredRealtimeFixtureRunId } from "./realtime-fixture-names";

describe("realtime fixture naming", () => {
  it("requires an explicit, valid run identifier", () => {
    expect(() => requiredRealtimeFixtureRunId({})).toThrow("REALTIME_FIXTURE_RUN_ID");
    expect(() => requiredRealtimeFixtureRunId({ REALTIME_FIXTURE_RUN_ID: "bad id" })).toThrow("3-40 letters");
    expect(requiredRealtimeFixtureRunId({ REALTIME_FIXTURE_RUN_ID: "regression-20261103" })).toBe("regression-20261103");
  });

  it("gives each explicit realtime run its own group name", () => {
    expect(realtimeFixtureGroupName("DEV — Realtime Meetings Run", "run-a")).not.toBe(
      realtimeFixtureGroupName("DEV — Realtime Meetings Run", "run-b"),
    );
  });
});
