import Link from "next/link";

import type { PeopleDetail } from "./detail-model";

export type PeopleBreadcrumb = { label: string; href?: string };

export function parsePeopleTrail(value: string | undefined, recordId: string) {
  const ids = (value ?? "").split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const unique = ids.filter((id, index) => ids.indexOf(id) === index);
  return unique.filter((id) => id !== recordId).slice(-8);
}

export function peopleDetailHref(recordId: string, trail: string[]) {
  const next = [...trail.filter((id) => id !== recordId), recordId].slice(-8);
  return `/people/${recordId}?trail=${encodeURIComponent(next.join(","))}`;
}

export function buildPeopleBreadcrumbs(detail: PeopleDetail, parents: PeopleDetail[], trail: string[]) {
  const items: PeopleBreadcrumb[] = [{ label: "People & Teams", href: "/people" }];
  parents.forEach((parent, index) => items.push({ label: parent.name, href: peopleDetailHref(parent.id, trail.slice(0, index)) }));
  items.push({ label: detail.name });
  return items;
}

export function PeopleBreadcrumbs({ items }: { items: PeopleBreadcrumb[] }) {
  return <nav aria-label="Breadcrumb" className="mb-4 min-w-0 overflow-hidden text-sm text-text-muted"><ol className="flex flex-wrap items-center gap-x-1 gap-y-1"><li><span className="sr-only">You are here: </span></li>{items.map((item, index) => <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1"><span aria-hidden="true" className="inline-flex min-w-5 justify-center">/</span>{item.href ? <Link href={item.href} className="max-w-48 truncate text-brand-primary hover:underline sm:max-w-72">{item.label}</Link> : <span aria-current="page" className="max-w-56 truncate font-medium text-text-primary sm:max-w-96">{item.label}</span>}</li>)}</ol></nav>;
}
