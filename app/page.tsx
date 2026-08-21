import { redirect } from "next/navigation";

import { getAuthenticatedIdentity } from "@/lib/auth/session";

export default async function RootRoute() {
  const identity = await getAuthenticatedIdentity();
  redirect(identity ? "/workspace" : "/login");
}
