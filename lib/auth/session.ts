import "server-only";

import { redirect } from "next/navigation";

import { isAppRole, type AppRole } from "@/lib/counseling/domain";
import {
  availableWorkspacesForRoles,
  type WorkspaceId,
} from "@/lib/workspaces";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  defaultWorkspaceDestination,
  loginDestination,
} from "./authorization";

export interface AuthenticatedIdentity {
  displayName: string;
  roles: AppRole[];
  workspaces: WorkspaceId[];
}

export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;

  if (typeof userId !== "string") return null;

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, last_name, email, status")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("profile_roles").select("role").eq("profile_id", userId),
  ]);

  if (!profile || profile.status !== "active") {
    return { displayName: "Resonate member", roles: [], workspaces: [] };
  }

  const roles = [...new Set((roleRows ?? []).map((row) => row.role).filter(isAppRole))];
  const workspaces = availableWorkspacesForRoles(roles).map((workspace) => workspace.id);
  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(" ")
    || profile.email
    || "Resonate member";

  return { displayName, roles, workspaces };
}

export async function requireDefaultWorkspace(path: string) {
  const identity = await getAuthenticatedIdentity();

  if (!identity) redirect(loginDestination(path));
  if (!identity.workspaces.length) redirect("/login?error=access");

  return { identity, workspace: identity.workspaces[0]! };
}

export async function requireWorkspace(workspace: WorkspaceId, path: string) {
  const { identity } = await requireDefaultWorkspace(path);

  if (!identity.workspaces.includes(workspace)) {
    redirect(defaultWorkspaceDestination(identity.workspaces)!);
  }

  return identity;
}
