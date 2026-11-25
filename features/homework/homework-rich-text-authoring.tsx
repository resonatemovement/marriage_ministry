"use client";

import { RichTextBlockAuthoring } from "@/features/session-builder/rich-text-block-authoring";

export function HomeworkRichTextAuthoring({ title, content, onTitleChange, onContentChange, onDone, onCancel }: {
  title: string | null;
  content: Record<string, unknown>;
  onTitleChange: (value: string) => void;
  onContentChange: (value: Record<string, unknown>) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  return <RichTextBlockAuthoring title={title} content={content} onTitleChange={onTitleChange}
    onContentChange={onContentChange} onDone={onDone} onCancel={onCancel} requireTitle={false} doneLabel="Done" />;
}
