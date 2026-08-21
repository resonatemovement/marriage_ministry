import "server-only";

import { redirect } from "next/navigation";

import { isAppRole, type AppRole } from "@/lib/counseling/domain";
import {
  availableWorkspacesForRoles,
  defaultWorkspaceForRoles,
  type WorkspaceId,
} from "@/lib/workspaces";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  defaultWorkspaceDestination,
  loginDestination,
} from "./authorization";
import { getActiveWorkspace } from "./active-workspace";

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

  const workspace = defaultWorkspaceForRoles(identity.roles)?.id;
  if (!workspace) redirect("/login?error=access");

  return { identity, workspace };
}

export async function requireActiveWorkspace(path: string) {
  const { identity, workspace: defaultWorkspace } = await requireDefaultWorkspace(path);
  const workspace = await getActiveWorkspace(identity.workspaces, defaultWorkspace);

  return { identity, workspace: workspace! };
}

export async function requireWorkspace(workspace: WorkspaceId, path: string) {
  const { identity } = await requireDefaultWorkspace(path);

  if (!identity.workspaces.includes(workspace)) {
    redirect(defaultWorkspaceDestination(identity.workspaces)!);
  }

  return identity;
}
