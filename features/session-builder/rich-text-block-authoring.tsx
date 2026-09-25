"use client";

import { RichTextEditor } from "./rich-text-editor";
import { richTextBlockIsComplete } from "@/components/shared/authoring-completion";

export function RichTextBlockAuthoring({ title, content, onTitleChange, onContentChange, onDone, requireTitle = true, doneLabel = "Done" }: {
  title: string | null;
  content: Record<string, unknown>;
  onTitleChange?: (value: string) => void;
  onContentChange: (value: Record<string, unknown>) => void;
  onDone: () => void;
  requireTitle?: boolean;
  doneLabel?: string;
}) {
  const complete = richTextBlockIsComplete(title, content, requireTitle);
  return <>
    {requireTitle ? <label className="grid gap-1.5 text-sm font-medium text-text-primary">Title<input value={title ?? ""} onChange={(event) => onTitleChange?.(event.target.value)} maxLength={180} className="min-h-10 rounded-md border border-border px-3 text-sm" /></label> : null}
    <RichTextEditor content={content} onChange={onContentChange} />
    <div className="flex justify-end"><button type="button" onClick={() => { if (complete) onDone(); }} disabled={!complete} className="min-h-10 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:bg-brand-primary/90">{doneLabel}</button></div>
  </>;
}
