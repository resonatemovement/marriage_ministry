import { redirect } from "next/navigation";

import { postLoginDestination } from "@/lib/auth/authorization";
import { getAuthenticatedIdentity } from "@/lib/auth/session";

export default async function AuthEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [identity, params] = await Promise.all([getAuthenticatedIdentity(), searchParams]);

  if (!identity) redirect("/login");

  const destination = postLoginDestination(identity.workspaces, params.next);
  redirect(destination ?? "/login?error=access");
}
