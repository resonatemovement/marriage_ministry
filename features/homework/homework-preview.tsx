"use client";

import { ExternalLink } from "lucide-react";
import { RadioGroup } from "radix-ui";
import { Checkbox } from "@/components/ui/checkbox";
import { RichTextReadOnly } from "@/features/session-builder/rich-text-editor";
import { richTextBlockIsComplete, videoLinkIsComplete } from "@/components/shared/authoring-completion";
import type { StagedHomeworkBlock } from "./homework-editor-model";
import { isValidHomeworkVideoUrl } from "./homework-url";

export function HomeworkPreviewContent({ blocks }: { blocks: StagedHomeworkBlock[] }) {
  if (blocks.length === 0) {
    return <div className="mx-auto max-w-3xl rounded-lg border border-dashed border-border bg-surface p-6 text-center sm:p-10">
      <h2 className="font-heading text-lg font-bold text-text-primary">No homework content yet.</h2>
      <p className="mt-2 text-sm text-text-muted">This Session does not currently include homework content.</p>
    </div>;
  }

  return <div className="mx-auto grid max-w-3xl gap-4 sm:gap-6">
    {blocks.map((block) => <HomeworkPreviewBlock key={block.key} block={block} />)}
  </div>;
}

function HomeworkPreviewBlock({ block }: { block: StagedHomeworkBlock }) {
  if (block.blockType === "rich_text") {
    if (!isRichTextContent(block.richTextContent) || !richTextBlockIsComplete(block.title, block.richTextContent)) {
      return <IncompletePreviewBlock />;
    }

    return <article className="overflow-hidden rounded-lg border border-border bg-white">
      <h2 className="px-5 pt-5 font-heading text-lg font-bold text-text-primary sm:px-7 sm:pt-7">{block.title}</h2>
      <RichTextReadOnly content={block.richTextContent} />
    </article>;
  }

  if (block.blockType === "video_link") {
    if (!videoLinkIsComplete({ title: block.title ?? "", url: block.url ?? "", description: block.description ?? "" }, isValidHomeworkVideoUrl)) {
      return <IncompletePreviewBlock />;
    }

    return <VideoLinkPreview title={block.title!} description={block.description!} url={block.url!} />;
  }

  if (block.blockType === "long_answer") {
    if (!isRichTextContent(block.richTextContent) || !richTextBlockIsComplete(null, block.richTextContent, false)) {
      return <IncompletePreviewBlock />;
    }

    return <article className="rounded-lg border border-border bg-white p-5 sm:p-7">
      <RichTextReadOnly content={block.richTextContent} />
      <div className="mt-6 border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`homework-preview-response-${block.key}`} className="text-sm font-semibold text-text-primary">Your response <span className="font-normal text-text-muted">(preview only)</span></label>
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-text-muted">Required</span>
        </div>
        <textarea id={`homework-preview-response-${block.key}`} readOnly rows={5} placeholder="Your response" className="mt-3 w-full resize-y rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text-primary" />
      </div>
    </article>;
  }

  if (block.blockType === "checkbox_question" || block.blockType === "radio_question") {
    if (!isRichTextContent(block.richTextContent) || !richTextBlockIsComplete(null, block.richTextContent, false)
      || block.questionChoices.length < 2
      || block.questionChoices.some((choice) => !choice.label.trim())
      || new Set(block.questionChoices.map((choice) => choice.id)).size !== block.questionChoices.length) {
      return <IncompletePreviewBlock />;
    }

    return <article className="rounded-lg border border-border bg-white p-5 sm:p-7">
      <div id={`homework-preview-question-${block.key}`}><RichTextReadOnly content={block.richTextContent} /></div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Answer choices</h2>
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-text-muted">{block.isRequired ? "Required" : "Optional"}</span>
      </div>
      {block.blockType === "checkbox_question" ? <div role="group" className="mt-3 grid gap-3" aria-labelledby={`homework-preview-question-${block.key}`}>
        {block.questionChoices.map((choice) => <label key={choice.id} className="flex min-h-8 items-center gap-3 text-sm text-text-primary">
          <Checkbox checked={false} disabled aria-label={choice.label} />
          <span>{choice.label}</span>
        </label>)}
      </div> : <RadioGroup.Root disabled aria-labelledby={`homework-preview-question-${block.key}`} className="mt-3 grid gap-3">
        {block.questionChoices.map((choice) => <div key={choice.id} className="flex min-h-8 items-center gap-3 text-sm text-text-primary">
          <RadioGroup.Item value={choice.id} aria-label={choice.label} className="grid size-4 shrink-0 place-items-center rounded-full border border-border bg-white disabled:cursor-not-allowed disabled:opacity-70">
            <RadioGroup.Indicator className="size-2 rounded-full bg-brand-primary" />
          </RadioGroup.Item>
          <span>{choice.label}</span>
        </div>)}
      </RadioGroup.Root>}
    </article>;
  }

  return <article className="rounded-lg border border-border bg-surface-muted p-5 sm:p-7">
    <p className="text-sm text-text-muted">This content type cannot currently be previewed.</p>
  </article>;
}

export function VideoLinkPreview({ title, description, url }: { title: string; description: string; url: string }) {
  return <article className="rounded-lg border border-border bg-white p-5 sm:p-7">
    <h2 className="font-heading text-lg font-bold text-text-primary">{title}</h2>
    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-text-muted">{description}</p>
    <div className="mt-5">
      <a href={url} target="_blank" rel="noreferrer" aria-label={`Open Link: ${url}`} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90 focus-visible:bg-brand-primary/90">
        Open Link<ExternalLink className="size-4" aria-hidden="true" />
      </a>
    </div>
  </article>;
}

function IncompletePreviewBlock() {
  return <article className="rounded-lg border border-dashed border-border bg-surface-muted p-5 sm:p-7">
    <p className="text-sm font-medium text-text-muted">Incomplete content</p>
    <p className="mt-1 text-xs text-text-muted">Complete this block in the editor to preview it.</p>
  </article>;
}

function isRichTextContent(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
