"use client";

import { useLayoutEffect, useRef } from "react";
import { Plus } from "lucide-react";

import type { SideBySideAnswerRow, SideBySideResponseConfig, SideBySideResponseSide } from "./side-by-side-response";

export function SideBySideResponseFields({
  config,
  rows,
  readOnly = false,
  errors = {},
  onChange,
  onAdd,
}: {
  config: Omit<SideBySideResponseConfig, "side">;
  rows: SideBySideAnswerRow[];
  readOnly?: boolean;
  errors?: Partial<Record<SideBySideResponseSide, string>>;
  onChange?: (rowId: string, side: SideBySideResponseSide, value: string) => void;
  onAdd?: () => void;
}) {
  const textareas = useRef(new Map<string, HTMLTextAreaElement>());
  const headings = { left: config.leftHeading, right: config.rightHeading };

  useLayoutEffect(() => {
    const resize = () => {
      for (const row of rows) {
        const left = textareas.current.get(`${row.id}:left`);
        const right = textareas.current.get(`${row.id}:right`);
        if (!left || !right) continue;
        left.style.height = "auto";
        right.style.height = "auto";
        const height = Math.max(128, left.scrollHeight, right.scrollHeight);
        left.style.height = `${height}px`;
        right.style.height = `${height}px`;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [rows]);

  return <div className="mt-4">
    <div className="mb-2 hidden gap-4 md:grid md:grid-cols-2" aria-hidden="true">
      {(["left", "right"] as const).map((side) => <p key={side} className="break-words text-sm font-semibold text-text-primary">{headings[side]}</p>)}
    </div>
    <div className="grid gap-4">
      {rows.map((row) => <div key={row.id} className="grid min-w-0 gap-4 md:grid-cols-2">
        {(["left", "right"] as const).map((side) => {
          const id = `${row.id}:${side}`;
          return <div key={side} className="min-w-0">
            <label htmlFor={`response-${id}`} className="mb-1.5 block break-words text-sm font-semibold text-text-primary md:sr-only">{headings[side]}</label>
            <textarea
              ref={(element) => { if (element) textareas.current.set(id, element); else textareas.current.delete(id); }}
              id={`response-${id}`}
              value={row[side]}
              onChange={(event) => onChange?.(row.id, side, event.currentTarget.value)}
              readOnly={readOnly}
              rows={5}
              aria-invalid={Boolean(errors[side])}
              aria-describedby={errors[side] ? `response-error-${side}` : undefined}
              className="min-h-32 w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-base leading-6 text-text-primary read-only:bg-surface-muted"
            />
            {errors[side] ? <p id={`response-error-${side}`} role="alert" className="mt-2 text-sm text-danger">{errors[side]}</p> : null}
          </div>;
        })}
      </div>)}
    </div>
    {!readOnly && onAdd ? <button type="button" onClick={onAdd} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-brand-primary hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:text-brand-primary"><Plus className="size-4" aria-hidden="true" />Add response</button> : null}
  </div>;
}
