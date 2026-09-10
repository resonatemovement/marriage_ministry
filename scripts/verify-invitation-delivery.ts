import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; }

const { url, publishableKey } = getSupabaseEnvironment();
if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Invitation delivery verification refused: configured project is not approved DEV.");
const appUrl = required("APP_URL");
const redirectTo = new URL("/auth/activate", appUrl).toString();
if (new URL(redirectTo).origin !== new URL(appUrl).origin) throw new Error("Activation redirect URL is unsafe.");

const admin = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
const delivery = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
const addresses = [required("TEST_INVITATION_EMAIL_1").toLowerCase(), required("TEST_INVITATION_EMAIL_2").toLowerCase()];
const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (users.error) throw new Error("Unable to inspect controlled DEV invitation accounts.");

for (const email of addresses) {
  if (!users.data.users.some((user) => user.email?.toLowerCase() === email)) {
    const created = await admin.auth.admin.createUser({ email, password: `${crypto.randomUUID()}-${crypto.randomUUID()}!`, email_confirm: true });
    if (created.error) throw new Error("Unable to prepare controlled DEV activation account.");
  }
  const result = await delivery.auth.resetPasswordForEmail(email, { redirectTo });
  if (result.error) throw new Error(`DEV activation delivery failed for a controlled test address: ${result.error.message}`);
}

console.log("DEV activation delivery attempted for both controlled test addresses.");
