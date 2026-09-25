"use client";

import { useEffect, useRef, useState } from "react";

import { richTextSummary, richTextSummaryOverflows } from "./rich-text-summary-model";

export function RichTextSummary({ content, title, emptyText }: {
  content: unknown;
  title: string | null;
  emptyText: string;
}) {
  const summary = richTextSummary(content, title);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      if (!expanded) setHasOverflow(richTextSummaryOverflows(body.scrollHeight, body.clientHeight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [summary.body, expanded]);

  return <div>
    {summary.title ? <h4 className="mt-1 truncate text-sm font-semibold text-text-primary">{summary.title}</h4> : null}
    {summary.body ? <>
      <p ref={bodyRef} className={`mt-3 whitespace-pre-line text-sm text-text-muted ${expanded ? "" : "line-clamp-2"}`}>{summary.body}</p>
      {hasOverflow ? <button type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)} className="mt-1 rounded-md text-sm font-semibold text-brand-primary hover:underline focus-visible:bg-sidebar-accent focus-visible:text-brand-primary">
        {expanded ? "Show less" : "View more"}
      </button> : null}
    </> : <p className="mt-3 text-sm text-text-muted">{emptyText}</p>}
  </div>;
}
