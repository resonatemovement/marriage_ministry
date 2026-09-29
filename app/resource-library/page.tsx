import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { ResourceLibrary } from "@/features/resource-library/resource-library";
import { requireResourceLibraryAccess } from "@/features/resource-library/access";
import { loadResourceLibrary } from "@/features/resource-library/library-data";
import { hasAdministrativeAccess } from "@/lib/counseling/domain";

export default async function ResourceLibraryPage() {
  const access = await requireResourceLibraryAccess("/resource-library");
  const isAdmin = hasAdministrativeAccess(access.identity.roles);
  let initialResources = { resources: [], count: 0 } as Awaited<ReturnType<typeof loadResourceLibrary>>;
  let initialError: string | null = null;
  try {
    initialResources = await loadResourceLibrary();
  } catch {
    initialError = "Resource Library is temporarily unavailable. Please try again.";
  }
  return (
    <WorkspaceShell workspace={access.workspace} activeHref="/resource-library" identity={access.identity}>
      <ResourceLibrary
        initialResources={initialResources.resources}
        initialCount={initialResources.count}
        initialError={initialError}
        isAdmin={isAdmin}
      />
    </WorkspaceShell>
  );
}
