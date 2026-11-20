import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseHomeworkCompletionAutomaticDevScope } from "./homework-completion-automatic-dev-scope";

const base = {
  vercel: "1",
  vercelEnv: "production",
  vercelProjectId: "prj_J5QbuVHBVRyQeq78Qd6G9HmJFbVt",
  supabaseUrl: "https://lctkqjjkhpyootwvttvj.supabase.co",
  firstCounselorEmail: "counselor-one@mailinator.com",
  secondCounselorEmail: "counselor-two@mailinator.com",
};

describe("automatic Homework notification DEV scope", () => {
  it("accepts only the dedicated DEV production runtime and two unique synthetic recipients", () => {
    expect(parseHomeworkCompletionAutomaticDevScope(base)).toMatchObject({
      coupleGroupId: "23f1ac05-7090-4081-bf42-78f92a8da5d1",
      allowedRecipients: ["counselor-one@mailinator.com", "counselor-two@mailinator.com"],
    });
    for (const change of [
      { vercel: undefined },
      { vercelEnv: "preview" },
      { vercelProjectId: "another-project" },
      { supabaseUrl: "https://wrong-project.supabase.co" },
      { supabaseUrl: "https://lctkqjjkhpyootwvttvj.supabase.co/?override=true" },
      { firstCounselorEmail: undefined },
      { secondCounselorEmail: "counselor-one@mailinator.com" },
      { secondCounselorEmail: "real-counselor@example.org" },
    ]) {
      expect(parseHomeworkCompletionAutomaticDevScope({ ...base, ...change })).toBeNull();
    }
  });
});
