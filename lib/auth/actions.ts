"use server";

import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveActiveWorkspace } from "@/lib/workspace-selection";

import { clearActiveWorkspace, setActiveWorkspace } from "./active-workspace";
import { requireDefaultWorkspace } from "./session";

export async function switchWorkspace(requestedWorkspace: string) {
  const { identity, workspace: defaultWorkspace } = await requireDefaultWorkspace("/workspace");
  const workspace = resolveActiveWorkspace(identity.workspaces, requestedWorkspace, defaultWorkspace);

  if (!workspace) redirect("/login?error=access");

  await setActiveWorkspace(workspace);
  redirect("/workspace");
}

export async function signOut() {
  await clearActiveWorkspace();
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
