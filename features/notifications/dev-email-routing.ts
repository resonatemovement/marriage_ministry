export const RESEND_DEV_TEST_RECIPIENT = "delivered@resend.dev";
const DEV_SUPABASE_PROJECT_REF = "lctkqjjkhpyootwvttvj";

type EmailRoutingEnvironment = {
  nodeEnv: string | undefined;
  testMode: string | undefined;
  supabaseUrl: string | undefined;
};

export function resolveEmailRecipient(intendedRecipient: string, environment: EmailRoutingEnvironment) {
  let hostname = "";
  try {
    hostname = new URL(environment.supabaseUrl ?? "").hostname;
  } catch {
    return { email: intendedRecipient, isTestSink: false };
  }
  const projectRef = hostname.endsWith(".supabase.co") ? hostname.slice(0, -".supabase.co".length) : "";
  const useTestSink = environment.nodeEnv === "development"
    && environment.testMode === "true"
    && projectRef === DEV_SUPABASE_PROJECT_REF;
  return { email: useTestSink ? RESEND_DEV_TEST_RECIPIENT : intendedRecipient, isTestSink: useTestSink };
}
