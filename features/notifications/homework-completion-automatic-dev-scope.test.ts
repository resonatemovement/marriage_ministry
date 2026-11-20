import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { isHomeworkCompletionAutomaticDevEnvironment } from "./homework-completion-automatic-dev-runtime";

const base = {
  vercel: "1",
  vercelEnv: "production",
  vercelProjectId: "prj_J5QbuVHBVRyQeq78Qd6G9HmJFbVt",
  supabaseUrl: "https://lctkqjjkhpyootwvttvj.supabase.co",
};

describe("automatic Homework notification DEV environment", () => {
  it("accepts the dedicated DEV runtime without recipient-specific environment variables", () => {
    expect(isHomeworkCompletionAutomaticDevEnvironment(base)).toBe(true);
    for (const change of [
      { vercel: undefined },
      { vercelEnv: "preview" },
      { vercelProjectId: "another-project" },
      { supabaseUrl: "https://wrong-project.supabase.co" },
      { supabaseUrl: "https://lctkqjjkhpyootwvttvj.supabase.co/?override=true" },
    ]) {
      expect(isHomeworkCompletionAutomaticDevEnvironment({ ...base, ...change })).toBe(false);
    }
  });
});
