import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

interface RelationshipRow { id: string; name: string; metadata: string; href: string; action?: ReactNode; }

export function RelationshipCard({ title, rows, empty, footer }: { title: string; rows: RelationshipRow[]; empty: string; footer?: ReactNode }) {
  return <Card className="p-4"><section><div className="flex items-center justify-between gap-3"><h2 className="font-heading text-base font-semibold text-text-primary">{title}</h2><span className="text-sm font-medium text-text-muted">{rows.length}</span></div><div className="mt-3 divide-y divide-border">{rows.length ? rows.map((row) => <div key={row.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><p className="text-sm font-medium text-text-primary">{row.name}</p><p className="mt-0.5 text-xs text-text-muted">{row.metadata}</p></div><div className="flex shrink-0 items-center gap-3">{row.action}<Link href={row.href} className="text-sm font-semibold text-brand-primary hover:underline">View</Link></div></div>) : <p className="py-1 text-sm text-text-muted">{empty}</p>}</div>{footer ? <div className="mt-4 border-t border-border pt-3">{footer}</div> : null}</section></Card>;
}
