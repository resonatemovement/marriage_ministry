export const DEV_SUPABASE_PROJECT_REF = "lctkqjjkhpyootwvttvj";

export function isDevCounselingProject(url = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  if (!url) return false;
  try {
    return new URL(url).hostname === `${DEV_SUPABASE_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}
