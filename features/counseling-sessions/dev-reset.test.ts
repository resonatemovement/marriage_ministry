import { describe, expect, it } from "vitest";
import { DEV_SUPABASE_PROJECT_REF, isDevCounselingProject } from "./dev-reset";

describe("DEV counseling journey reset environment guard", () => {
  it("matches only the linked DEV Supabase project", () => {
    expect(isDevCounselingProject(`https://${DEV_SUPABASE_PROJECT_REF}.supabase.co`)).toBe(true);
    expect(isDevCounselingProject("https://production-project.supabase.co")).toBe(false);
    expect(isDevCounselingProject("not a URL")).toBe(false);
    expect(isDevCounselingProject(undefined)).toBe(false);
  });
});
