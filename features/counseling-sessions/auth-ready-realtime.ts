type AuthSessionResult = {
  data: { session: { access_token: string } | null };
  error: unknown;
};

export type AuthReadyRealtimeClient = {
  auth: { getSession(): Promise<AuthSessionResult> };
  realtime: { setAuth(token: string): Promise<void> };
};

export type RealtimeFeature = "homework_progress" | "meetings" | "case_lifecycle";
export type RealtimeSubscriptionStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";
export type RealtimeFailurePhase = "initial_join" | "post_subscription";
type RealtimeDiagnosticStatus = Exclude<RealtimeSubscriptionStatus, "SUBSCRIBED"> | "AUTH_UNAVAILABLE" | "AUTH_ERROR";
type RealtimeFailureCategory = "transport_failure" | "socket_closed" | "timeout" | "unknown" | "missing_session" | "initialization_failed";

function areFeatureRealtimeSubscriptionsEnabled() {
  return process.env.NODE_ENV !== "development"
    || process.env.NEXT_PUBLIC_DEV_DISABLE_REALTIME_SUBSCRIPTIONS !== "true";
}

export function startFeatureRealtimeSubscription(setup: () => () => void) {
  if (!areFeatureRealtimeSubscriptionsEnabled()) return;
  return setup();
}

const diagnosticCategory: Record<RealtimeDiagnosticStatus, RealtimeFailureCategory> = {
  AUTH_UNAVAILABLE: "missing_session",
  AUTH_ERROR: "initialization_failed",
  CHANNEL_ERROR: "unknown",
  TIMED_OUT: "timeout",
  CLOSED: "unknown",
};

function isValidWebSocketCloseCode(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 1000
    && value <= 4999;
}

function getOwnDataValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function getSafeCloseCode(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  const cause = getOwnDataValue(error, "cause");
  if (!cause || typeof cause !== "object") return undefined;

  const ownCode = getOwnDataValue(cause, "code");
  if (isValidWebSocketCloseCode(ownCode)) return ownCode;

  if (typeof CloseEvent !== "undefined" && cause instanceof CloseEvent) {
    const codeGetter = Object.getOwnPropertyDescriptor(CloseEvent.prototype, "code")?.get;
    const closeCode = codeGetter?.call(cause) as unknown;
    if (isValidWebSocketCloseCode(closeCode)) return closeCode;
  }

  return undefined;
}

function classifyRealtimeFailure(
  status: RealtimeDiagnosticStatus,
  error?: unknown,
): { category: RealtimeFailureCategory; closeCode?: number } {
  if (status !== "CHANNEL_ERROR") return { category: diagnosticCategory[status] };

  const closeCode = getSafeCloseCode(error);
  if (closeCode !== undefined) return { category: "socket_closed", closeCode };

  if (error instanceof Error) {
    const cause = getOwnDataValue(error, "cause");
    const message = getOwnDataValue(error, "message");
    if (message === "channel error: transport failure"
      && cause !== null && typeof cause === "object") {
      return { category: "transport_failure" };
    }
  }

  return { category: "unknown" };
}

export function logRealtimeSubscriptionFailure(
  feature: RealtimeFeature,
  phase: RealtimeFailurePhase,
  status: RealtimeDiagnosticStatus,
  error?: unknown,
) {
  if (process.env.NODE_ENV !== "development") return;

  let classification: ReturnType<typeof classifyRealtimeFailure>;
  try {
    classification = classifyRealtimeFailure(status, error);
  } catch {
    classification = { category: status === "TIMED_OUT" ? "timeout" : diagnosticCategory[status] };
  }
  console.warn("Realtime subscription unavailable.", {
    feature,
    phase,
    status,
    ...classification,
  });
}

export function createRealtimeStatusHandler({
  feature,
  scheduleRefresh,
}: {
  feature: RealtimeFeature;
  scheduleRefresh: () => void;
}) {
  let recoveryNeeded = false;
  let failurePhase: RealtimeFailurePhase = "initial_join";
  let hasSubscribed = false;

  return (status: RealtimeSubscriptionStatus, error?: unknown) => {
    if (status === "SUBSCRIBED") {
      if (recoveryNeeded) {
        if (process.env.NODE_ENV === "development") {
          console.info("Realtime subscription recovered.", {
            feature,
            phase: failurePhase,
            status,
            category: "recovered",
          });
        }
        scheduleRefresh();
      }
      recoveryNeeded = false;
      hasSubscribed = true;
      return;
    }

    recoveryNeeded = true;
    failurePhase = hasSubscribed ? "post_subscription" : "initial_join";
    logRealtimeSubscriptionFailure(feature, failurePhase, status, error);
  };
}

export function startAuthReadyRealtimeSubscription({
  client,
  feature,
  subscribe,
}: {
  client: AuthReadyRealtimeClient;
  feature: RealtimeFeature;
  subscribe: () => () => void;
}) {
  let disposed = false;
  let removeSubscription: (() => void) | null = null;

  const ready = (async () => {
    try {
      const { data, error } = await client.auth.getSession();
      if (disposed) return;

      const accessToken = data.session?.access_token;
      if (error || !accessToken) {
        logRealtimeSubscriptionFailure(feature, "initial_join", "AUTH_UNAVAILABLE");
        return;
      }

      await client.realtime.setAuth(accessToken);
      if (disposed) return;

      removeSubscription = subscribe();
    } catch {
      if (!disposed) logRealtimeSubscriptionFailure(feature, "initial_join", "AUTH_ERROR");
    }
  })();

  return {
    ready,
    dispose() {
      disposed = true;
      removeSubscription?.();
      removeSubscription = null;
    },
  };
}
