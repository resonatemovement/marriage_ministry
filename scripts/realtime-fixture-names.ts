const RUN_ID_ENV = "REALTIME_FIXTURE_RUN_ID";

export function requiredRealtimeFixtureRunId(environment: Readonly<Record<string, string | undefined>> = process.env) {
  const runId = environment[RUN_ID_ENV]?.trim();
  if (!runId) throw new Error(`Missing required environment variable: ${RUN_ID_ENV}`);
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/i.test(runId)) {
    throw new Error(`${RUN_ID_ENV} must be 3-40 letters, numbers, or hyphens`);
  }
  return runId;
}

export function realtimeFixtureGroupName(prefix: string, runId: string) {
  return `${prefix} — Run ${runId}`;
}
