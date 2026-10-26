type QueryError = { code?: string; message: string } | null;

export function counselingSessionQueryFailure(
  caseResult: { error: QueryError },
  sessionsResult: { error: QueryError },
  meetingsResult: { error: QueryError },
  caseSessionsResult: { error: QueryError },
  assignmentsResult: { error: QueryError },
  materialOptionsResult: { error: QueryError },
  identityResult: { error: QueryError },
) {
  const failure = ([
    ["caseResult", caseResult.error],
    ["sessionsResult", sessionsResult.error],
    ["meetingsResult", meetingsResult.error],
    ["caseSessionsResult", caseSessionsResult.error],
    ["assignmentsResult", assignmentsResult.error],
    ["materialOptionsResult", materialOptionsResult.error],
    ["identityResult", identityResult.error],
  ] as const).find(([, error]) => error) as ["caseResult" | "sessionsResult" | "meetingsResult" | "caseSessionsResult" | "assignmentsResult" | "materialOptionsResult" | "identityResult", NonNullable<QueryError>] | undefined;
  return failure ? { query: failure[0], code: failure[1].code ?? null, message: failure[1].message } : undefined;
}
