import { redirect } from "next/navigation";

import { LoginPage } from "@/features/auth/login-page";
import { defaultWorkspaceDestination } from "@/lib/auth/authorization";
import { getAuthenticatedIdentity } from "@/lib/auth/session";

export default async function LoginRoute({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const [identity, params] = await Promise.all([getAuthenticatedIdentity(), searchParams]);
  const destination = identity && defaultWorkspaceDestination(identity.workspaces);

  if (destination) redirect(destination);

  return <LoginPage error={params.error} next={params.next} />;
}
