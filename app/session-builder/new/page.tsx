import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { requireSessionBuilderAccess } from "@/features/session-builder/access";
import { SessionEditor } from "@/features/session-builder/session-editor";

export default async function NewSessionPage() {
  const access = await requireSessionBuilderAccess("/session-builder/new");
  return <WorkspaceShell workspace={access.workspace} activeHref="/session-builder" identity={access.identity}><main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10"><Breadcrumb className="mb-5"><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/session-builder">Session Builder</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>Create a Session</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb><h1 className="font-heading text-3xl font-bold text-text-primary">Create a Session</h1><p className="mt-2 text-sm text-text-muted">Build the session material and save when you&apos;re ready.</p><section className="mt-6 rounded-lg border border-border bg-surface p-5 sm:p-6"><SessionEditor session={null} /></section></main></WorkspaceShell>;
}
