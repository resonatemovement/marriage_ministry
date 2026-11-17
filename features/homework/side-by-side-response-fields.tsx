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
  const headings = { left: config.leftHeading, right: config.rightHeading };

  return <div className="mt-4">
    <div className="mb-2 grid grid-cols-2 gap-2 sm:gap-4" aria-hidden="true">
      {(["left", "right"] as const).map((side) => <p key={side} className="min-w-0 break-words px-1 text-sm font-semibold text-text-primary sm:px-3">{headings[side]}</p>)}
    </div>
    <div className="grid gap-4">
      {rows.map((row) => <div key={row.id} className="grid min-w-0 grid-cols-2 items-stretch gap-2 sm:gap-4">
        {(["left", "right"] as const).map((side) => {
          const id = `${row.id}:${side}`;
          return <div key={side} className="flex min-w-0 flex-col px-1 sm:px-3">
            <label htmlFor={`response-${id}`} className="sr-only">{headings[side]}</label>
            <textarea
              id={`response-${id}`}
              value={row[side]}
              onChange={(event) => onChange?.(row.id, side, event.currentTarget.value)}
              readOnly={readOnly}
              rows={2}
              aria-invalid={Boolean(errors[side])}
              aria-describedby={errors[side] ? `response-error-${side}` : undefined}
              className="homework-side-by-side-response-textarea field-sizing-content min-h-[66px] max-h-32 w-full flex-auto resize-none overflow-y-auto rounded-md border border-border bg-surface px-2 py-2 text-base leading-6 text-text-primary read-only:bg-surface-muted sm:px-3"
            />
            {errors[side] ? <p id={`response-error-${side}`} role="alert" className="mt-2 text-sm text-danger">{errors[side]}</p> : null}
          </div>;
        })}
      </div>)}
    </div>
    {!readOnly && onAdd ? <button type="button" onClick={onAdd} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-brand-primary hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:text-brand-primary"><Plus className="size-4" aria-hidden="true" />Add response</button> : null}
  </div>;
}
