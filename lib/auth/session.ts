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
  id: string;
  displayName: string;
  roles: AppRole[];
  workspaces: WorkspaceId[];
  onboardingRequired: boolean;
  accountStage: "invited" | "password_required" | "onboarding" | "active" | "unknown";
}

export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
  const supabase = await createServerSupabaseClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims().catch(() => {
    throw new Error("Your session could not be verified. Please try again.");
  });
  if (claimsError) throw new Error("Your session could not be verified. Please try again.");
  const userId = claims?.claims?.sub;

  if (typeof userId !== "string") return null;

  const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, last_name, email, status")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("profile_roles").select("role").eq("profile_id", userId),
  ]).catch(() => {
    throw new Error("Your account information could not be loaded. Please try again.");
  });
  if (profileError) throw new Error("Your profile could not be loaded. Please try again.");
  if (rolesError) throw new Error("Your account roles could not be loaded. Please try again.");

  const accountStage = profile?.status as AuthenticatedIdentity["accountStage"] | undefined;
  if (!profile || accountStage !== "active") {
    return {
      id: userId,
      displayName: "Resonate member",
      roles: [],
      workspaces: [],
      onboardingRequired: accountStage === "onboarding",
      accountStage: accountStage === "invited" || accountStage === "password_required" || accountStage === "onboarding" ? accountStage : "unknown",
    };
  }

  const roles = [...new Set((roleRows ?? []).map((row) => row.role).filter(isAppRole))];
  const workspaces = availableWorkspacesForRoles(roles).map((workspace) => workspace.id);
  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(" ")
    || profile.email
    || "Resonate member";

  return { id: userId, displayName, roles, workspaces, onboardingRequired: false, accountStage: "active" };
}

export async function requireDefaultWorkspace(path: string) {
  const identity = await getAuthenticatedIdentity();

  if (!identity) redirect(loginDestination(path));
  if (identity.accountStage === "password_required") redirect("/auth/create-password");
  if (identity.accountStage === "onboarding") redirect("/onboarding");
  if (identity.accountStage !== "active") redirect("/login?error=activation");
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

export async function requireOneOfWorkspaces(workspaces: readonly WorkspaceId[], path: string) {
  const { identity } = await requireDefaultWorkspace(path);
  if (!workspaces.some((workspace) => identity.workspaces.includes(workspace))) {
    redirect(defaultWorkspaceDestination(identity.workspaces)!);
  }
  return identity;
}

export async function requireOneOfRoles(roles: readonly AppRole[], path: string) {
  const { identity } = await requireDefaultWorkspace(path);
  if (!roles.some((role) => identity.roles.includes(role))) {
    redirect(defaultWorkspaceDestination(identity.workspaces)!);
  }
  return identity;
}
