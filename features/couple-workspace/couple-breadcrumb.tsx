import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

export function CoupleBreadcrumb({ parent, current, sessionsHref }: { parent: string; current: string; sessionsHref?: string }) {
  return <Breadcrumb className="mb-5"><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/workspace">{parent}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator />{sessionsHref ? <><BreadcrumbItem><BreadcrumbLink href={sessionsHref}>Sessions</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /></> : null}<BreadcrumbItem><BreadcrumbPage>{current}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>;
}
