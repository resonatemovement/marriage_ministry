import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const setupScripts = [
  "setup-realtime-meetings-fixture.ts",
  "setup-realtime-case-lifecycle-fixtures.ts",
  "setup-realtime-final-verification-fixture.ts",
];

const retiredIdentifiers = [
  "9554f01a-d22f-409b-9255-2108c0f9e1a5",
  "95eac800-d449-4d06-9555-cf13c7a178c7",
  "172fbabd-1d5a-40dd-bd86-97e318f7b97d",
  "1bc549ee-5c8e-4037-84d6-bdc3c295837b",
  "6b824020-fd60-40e3-ac83-eb3ddc8812c1",
  "ef59520b-6e29-40c1-877a-6773e2c6e58e",
  "ae442afe-3e34-43f4-8060-422c489988ce",
  "37431ff7-a887-4953-9e00-a276fe78817c",
  "639b63c0-832b-445c-bc50-dd0f1a95d832",
  "9f85cf1c-8bae-491e-a18b-4ef315b04871",
  "DEV — Realtime Meetings Test",
  "DEV — Realtime Case Closure Test",
  "DEV — C2 Final Realtime Verification",
];

describe("realtime fixture setup dependencies", () => {
  it("does not require or recreate retired Couple/Case identities", () => {
    const entrypoints = setupScripts.map((script) => readFileSync(new URL(`./${script}`, import.meta.url), "utf8"));
    for (const source of entrypoints) {
      for (const retiredIdentifier of retiredIdentifiers) expect(source).not.toContain(retiredIdentifier);
      expect(source).toContain("requiredRealtimeFixtureRunId");
    }
  });

  it("keeps the unrelated progression fixture and does not reference unconfigured retired fixtures", () => {
    const lifecycleSetup = readFileSync(new URL("./setup-realtime-case-lifecycle-fixtures.ts", import.meta.url), "utf8");
    expect(lifecycleSetup).toContain("DEV — Realtime Session Progression Test");
    expect(lifecycleSetup).toContain("const PRESERVED_CASE_IDS");
  });
});
