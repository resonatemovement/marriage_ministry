import type { ReactNode } from "react";

export function AuthoringSectionHeader({ headingId, title, description, action }: {
  headingId: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 id={headingId} className="font-heading text-xl font-bold text-text-primary">{title}</h2>
      <p className="mt-1 text-sm text-text-muted">{description}</p>
    </div>
    {action}
  </div>;
}
