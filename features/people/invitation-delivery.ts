import "server-only";

import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { deliveryCategory, type InvitationDeliveryFailure } from "./invitation-delivery-model";

export type { InvitationDeliveryFailure } from "./invitation-delivery-model";

type ActivationDeliveryResult =
  | { success: true; authUserId: string }
  | { success: false; category: InvitationDeliveryFailure; authUserId: string | null };

function requiredSecretKey() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing required Supabase server configuration");
  return key;
}

function activationRedirectUrl() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("Missing application URL configuration");

  return new URL("/auth/activate", appUrl).toString();
}

function internalPassword() {
  // The value only exists long enough for the Admin API request and is never returned.
  return `${randomBytes(32).toString("base64url")}aA1!`;
}

export async function createAuthIdentityAndSendActivation(email: string): Promise<ActivationDeliveryResult> {
  let redirectTo: string;
  try {
    redirectTo = activationRedirectUrl();
  } catch {
    return { success: false, category: "redirect_configuration", authUserId: null };
  }

  const { url, publishableKey } = getSupabaseEnvironment();
  const admin = createClient(url, requiredSecretKey(), { auth: { autoRefreshToken: false, persistSession: false } });
  const created = await admin.auth.admin.createUser({
    email,
    password: internalPassword(),
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    return { success: false, category: deliveryCategory(created.error?.message ?? ""), authUserId: null };
  }

  const deliveryClient = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const delivery = await deliveryClient.auth.resetPasswordForEmail(email, { redirectTo });
  if (delivery.error) {
    return { success: false, category: deliveryCategory(delivery.error.message), authUserId: created.data.user.id };
  }

  return { success: true, authUserId: created.data.user.id };
}

export async function sendActivationForExistingAuthIdentity(email: string): Promise<{ success: true } | { success: false; category: InvitationDeliveryFailure }> {
  let redirectTo: string;
  try {
    redirectTo = activationRedirectUrl();
  } catch {
    return { success: false, category: "redirect_configuration" };
  }
  const { url, publishableKey } = getSupabaseEnvironment();
  const delivery = await createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.resetPasswordForEmail(email, { redirectTo });
  return delivery.error ? { success: false, category: deliveryCategory(delivery.error.message) } : { success: true };
}

export async function deleteAuthIdentity(authUserId: string) {
  const { url } = getSupabaseEnvironment();
  const admin = createClient(url, requiredSecretKey(), { auth: { autoRefreshToken: false, persistSession: false } });
  return admin.auth.admin.deleteUser(authUserId);
}

export async function authIdentityMatchesInvitation(authUserId: string, email: string) {
  const { url } = getSupabaseEnvironment();
  const admin = createClient(url, requiredSecretKey(), { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await admin.auth.admin.getUserById(authUserId);
  return !result.error && result.data.user?.email?.toLowerCase() === email.toLowerCase();
}
