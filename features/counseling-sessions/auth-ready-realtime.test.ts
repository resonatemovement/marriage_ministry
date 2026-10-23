import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRealtimeStatusHandler,
  startAuthReadyRealtimeSubscription,
} from "./auth-ready-realtime";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function authenticatedSession(accessToken = "test-access-token") {
  return { data: { session: { access_token: accessToken } }, error: null };
}

describe("auth-ready Realtime subscription setup", () => {
  let warningLog: ReturnType<typeof vi.spyOn>;
  let infoLog: ReturnType<typeof vi.spyOn>;
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    warningLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    infoLog = vi.spyOn(console, "info").mockImplementation(() => undefined);
    errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("awaits the authenticated session and Realtime auth before subscribing", async () => {
    const events: string[] = [];
    const session = deferred<ReturnType<typeof authenticatedSession>>();
    const client = {
      auth: { getSession: vi.fn(() => session.promise) },
      realtime: { setAuth: vi.fn(async () => { events.push("set-auth"); }) },
    };
    const subscribe = vi.fn(() => {
      events.push("subscribe");
      return vi.fn();
    });

    const subscription = startAuthReadyRealtimeSubscription({ client, feature: "case_lifecycle", subscribe });
    expect(subscribe).not.toHaveBeenCalled();

    session.resolve(authenticatedSession());
    await subscription.ready;

    expect(client.realtime.setAuth).toHaveBeenCalledWith("test-access-token");
    expect(events).toEqual(["set-auth", "subscribe"]);
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it("does not create an anonymous channel when the session is absent", async () => {
    const client = {
      auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
      realtime: { setAuth: vi.fn(async () => undefined) },
    };
    const subscribe = vi.fn(() => vi.fn());

    const subscription = startAuthReadyRealtimeSubscription({ client, feature: "homework_progress", subscribe });
    await subscription.ready;

    expect(client.realtime.setAuth).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(warningLog).toHaveBeenCalledWith("Realtime subscription unavailable.", {
      feature: "homework_progress",
      phase: "initial_join",
      status: "AUTH_UNAVAILABLE",
      category: "missing_session",
    });
  });

  it("does not subscribe when session retrieval or Realtime auth fails", async () => {
    const subscribe = vi.fn(() => vi.fn());
    const sessionFailure = startAuthReadyRealtimeSubscription({
      client: {
        auth: { getSession: vi.fn(async () => { throw new Error("private session failure"); }) },
        realtime: { setAuth: vi.fn(async () => undefined) },
      },
        feature: "meetings",
      subscribe,
    });
    await sessionFailure.ready;

    const authFailure = startAuthReadyRealtimeSubscription({
      client: {
        auth: { getSession: vi.fn(async () => authenticatedSession("private-token")) },
        realtime: { setAuth: vi.fn(async () => { throw new Error("private auth failure"); }) },
      },
      feature: "case_lifecycle",
      subscribe,
    });
    await authFailure.ready;

    expect(subscribe).not.toHaveBeenCalled();
    expect(JSON.stringify(warningLog.mock.calls)).not.toMatch(/private session failure|private auth failure|private-token/);
  });

  it("cannot create a late channel after disposal during session or Realtime auth setup", async () => {
    const delayedSession = deferred<ReturnType<typeof authenticatedSession>>();
    const delayedAuth = deferred<void>();
    const subscribe = vi.fn(() => vi.fn());
    const duringSession = startAuthReadyRealtimeSubscription({
      client: {
        auth: { getSession: vi.fn(() => delayedSession.promise) },
        realtime: { setAuth: vi.fn(async () => undefined) },
      },
      feature: "homework_progress",
      subscribe,
    });
    duringSession.dispose();
    delayedSession.resolve(authenticatedSession());
    await duringSession.ready;

    const duringAuth = startAuthReadyRealtimeSubscription({
      client: {
        auth: { getSession: vi.fn(async () => authenticatedSession()) },
        realtime: { setAuth: vi.fn(() => delayedAuth.promise) },
      },
      feature: "case_lifecycle",
      subscribe,
    });
    await Promise.resolve();
    duringAuth.dispose();
    delayedAuth.resolve();
    await duringAuth.ready;

    expect(subscribe).not.toHaveBeenCalled();
  });

  it("removes the initialized subscription exactly once", async () => {
    const remove = vi.fn();
    const subscription = startAuthReadyRealtimeSubscription({
      client: {
        auth: { getSession: vi.fn(async () => authenticatedSession()) },
        realtime: { setAuth: vi.fn(async () => undefined) },
      },
      feature: "meetings",
      subscribe: () => remove,
    });
    await subscription.ready;

    subscription.dispose();
    subscription.dispose();

    expect(remove).toHaveBeenCalledOnce();
  });

  it("distinguishes initial join failures from failures after subscription", () => {
    const refresh = vi.fn();
    const status = createRealtimeStatusHandler({ feature: "homework_progress", scheduleRefresh: refresh });

    status("CHANNEL_ERROR");
    expect(warningLog).toHaveBeenLastCalledWith("Realtime subscription unavailable.", {
      feature: "homework_progress",
      phase: "initial_join",
      status: "CHANNEL_ERROR",
      category: "unknown",
    });

    status("SUBSCRIBED");
    status("CHANNEL_ERROR");
    expect(warningLog).toHaveBeenLastCalledWith("Realtime subscription unavailable.", {
      feature: "homework_progress",
      phase: "post_subscription",
      status: "CHANNEL_ERROR",
      category: "unknown",
    });

    status("SUBSCRIBED");
    status("SUBSCRIBED");
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(infoLog).toHaveBeenCalledTimes(2);
    expect(infoLog).toHaveBeenLastCalledWith("Realtime subscription recovered.", {
      feature: "homework_progress",
      phase: "post_subscription",
      status: "SUBSCRIBED",
      category: "recovered",
    });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it.each([
    ["TIMED_OUT", undefined, "timeout", undefined],
    ["CLOSED", undefined, "unknown", undefined],
    ["CHANNEL_ERROR", undefined, "unknown", undefined],
    ["CHANNEL_ERROR", new Error("channel error: transport failure", { cause: { type: "error" } }), "transport_failure", undefined],
    ["CHANNEL_ERROR", new Error("socket closed: 1006", { cause: { code: 1006, reason: "private close detail" } }), "socket_closed", 1006],
    ["CHANNEL_ERROR", new Error("socket closed: 999", { cause: { code: 999 } }), "unknown", undefined],
    ["CHANNEL_ERROR", new Error("socket closed: 5000", { cause: { code: 5000 } }), "unknown", undefined],
    ["CHANNEL_ERROR", new Error("socket closed: 1000.5", { cause: { code: 1000.5 } }), "unknown", undefined],
    ["CHANNEL_ERROR", Object.assign(new Error("sensitive server rejection"), { cause: { message: "private server response", nested: { token: "secret-token" } } }), "unknown", undefined],
  ] as const)("classifies %s using only known safe error metadata", (failedStatus, error, category, closeCode) => {
    const status = createRealtimeStatusHandler({ feature: "meetings", scheduleRefresh: vi.fn() });
    status(failedStatus, error);

    expect(warningLog).toHaveBeenCalledOnce();
    expect(warningLog.mock.calls[0]).toEqual([
      "Realtime subscription unavailable.",
      {
        feature: "meetings",
        phase: "initial_join",
        status: failedStatus,
        category,
        ...(closeCode === undefined ? {} : { closeCode }),
      },
    ]);
    expect(JSON.stringify(warningLog.mock.calls)).not.toMatch(/sensitive server rejection|private server response|secret-token|private close detail/);
  });

  it("keeps diagnostics development-only and emits no console errors", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const status = createRealtimeStatusHandler({ feature: "homework_progress", scheduleRefresh: vi.fn() });
    status("CHANNEL_ERROR");
    status("SUBSCRIBED");

    const subscription = startAuthReadyRealtimeSubscription({
      client: {
        auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: new Error("private") })) },
        realtime: { setAuth: vi.fn(async () => undefined) },
      },
      feature: "homework_progress",
      subscribe: () => vi.fn(),
    });
    await subscription.ready;

    expect(warningLog).not.toHaveBeenCalled();
    expect(infoLog).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });
});
