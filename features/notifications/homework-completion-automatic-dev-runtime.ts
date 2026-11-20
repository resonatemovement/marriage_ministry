import "server-only";

const DEV_SUPABASE_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const DEV_VERCEL_PROJECT_ID = "prj_J5QbuVHBVRyQeq78Qd6G9HmJFbVt";

export type HomeworkCompletionAutomaticDevEnvironment = {
  vercel?: string;
  vercelEnv?: string;
  vercelProjectId?: string;
  supabaseUrl?: string;
};

export function isHomeworkCompletionAutomaticDevEnvironment(
  environment: HomeworkCompletionAutomaticDevEnvironment,
): boolean {
  if (environment.vercel !== "1"
    || environment.vercelEnv !== "production"
    || environment.vercelProjectId !== DEV_VERCEL_PROJECT_ID) return false;

  try {
    const url = new URL(environment.supabaseUrl ?? "");
    return url.origin === `https://${DEV_SUPABASE_PROJECT_REF}.supabase.co`
      && url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function isHomeworkCompletionAutomaticDevRuntime() {
  return isHomeworkCompletionAutomaticDevEnvironment({
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
    vercelProjectId: process.env.VERCEL_PROJECT_ID,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}
