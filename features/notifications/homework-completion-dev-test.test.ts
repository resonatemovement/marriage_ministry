import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  isHomeworkCompletionDevTestAuthorized,
  parseHomeworkCompletionDevTestConfig,
} from "./homework-completion-dev-test";

const base = {
  enabled: "true",
  vercel: "1",
  vercelEnv: "preview",
  vercelProjectId: "prj_J5QbuVHBVRyQeq78Qd6G9HmJFbVt",
  gitCommitRef: "feature/homework-completion-notification",
  supabaseUrl: "https://lctkqjjkhpyootwvttvj.supabase.co",
  notificationId: "11111111-1111-4111-8111-111111111111",
  caseSessionId: "22222222-2222-4222-8222-222222222222",
  coupleGroupId: "33333333-3333-4333-8333-333333333333",
  allowedRecipients: "first-counselor@mailinator.com,second-counselor@mailinator.com",
};

describe("Homework notification DEV test guard", () => {
  it("accepts only explicitly enabled, exact DEV Preview scope with two unique synthetic recipients", () => {
    expect(parseHomeworkCompletionDevTestConfig(base)).toMatchObject({
      executionMode: "preview",
      notificationId: base.notificationId,
      caseSessionId: base.caseSessionId,
      coupleGroupId: base.coupleGroupId,
      allowedRecipients: ["first-counselor@mailinator.com", "second-counselor@mailinator.com"],
    });
    for (const change of [
      { enabled: undefined }, { enabled: "false" }, { vercelEnv: "production" },
      { vercelProjectId: "other-project" }, { gitCommitRef: "main" },
      { supabaseUrl: "https://wrong-project.supabase.co" }, { notificationId: "" },
      { caseSessionId: "not-a-uuid" }, { coupleGroupId: undefined },
      { allowedRecipients: "real@example.org,second-counselor@mailinator.com" },
      { allowedRecipients: "first-counselor@mailinator.com,first-counselor@mailinator.com" },
      { allowedRecipients: "only-one@mailinator.com" },
    ]) {
      expect(parseHomeworkCompletionDevTestConfig({ ...base, ...change })).toBeNull();
    }
  });

  it("allows explicit local development only with NODE_ENV development and the exact DEV Supabase URL", () => {
    expect(parseHomeworkCompletionDevTestConfig({
      ...base,
      vercel: undefined,
      vercelEnv: undefined,
      vercelProjectId: undefined,
      gitCommitRef: undefined,
      localDevelopment: "true",
      nodeEnv: "development",
    })).toMatchObject({ executionMode: "local", notificationId: base.notificationId });

    for (const change of [
      { localDevelopment: undefined },
      { localDevelopment: "false" },
      { nodeEnv: "production" },
      { vercel: "1" },
      { vercelEnv: "production" },
      { supabaseUrl: "https://wrong-project.supabase.co" },
    ]) {
      expect(parseHomeworkCompletionDevTestConfig({
        ...base,
        vercel: undefined,
        vercelEnv: undefined,
        vercelProjectId: undefined,
        gitCommitRef: undefined,
        localDevelopment: "true",
        nodeEnv: "development",
        ...change,
      })).toBeNull();
    }
  });

  it("requires an exact configured notification and a sufficiently strong bearer credential", () => {
    expect(isHomeworkCompletionDevTestAuthorized(new Request("https://test.invalid", {
      headers: { authorization: `Bearer ${"x".repeat(32)}` },
    }), "x".repeat(32))).toBe(true);
    for (const [header, secret] of [
      [null, "x".repeat(32)], [`Bearer ${"x".repeat(31)}`, "x".repeat(32)],
      [`Bearer ${"x".repeat(32)}`, "y".repeat(32)], [`Bearer ${"x".repeat(32)}`, "short"],
    ] as const) {
      const headers = header ? { authorization: header } : undefined;
      expect(isHomeworkCompletionDevTestAuthorized(new Request("https://test.invalid", { headers }), secret)).toBe(false);
    }
  });
});
