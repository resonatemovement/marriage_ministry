import { useId } from "react";

export function VideoLinkFields({ title, url, description, onTitleChange, onUrlChange, onDescriptionChange, urlError }: {
  title: string;
  url: string;
  description: string;
  onTitleChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  urlError: string | null;
}) {
  const errorId = useId();
  return <>
    <label className="grid gap-1.5 text-sm font-medium text-text-primary">Title<input value={title} onChange={(event) => onTitleChange(event.target.value)} maxLength={180} className="min-h-10 rounded-md border border-border px-3 text-sm" /></label>
    <label className="grid gap-1.5 text-sm font-medium text-text-primary">URL<input value={url} onChange={(event) => onUrlChange(event.target.value)} type="url" required placeholder="https://" aria-invalid={urlError ? true : undefined} aria-describedby={urlError ? errorId : undefined} className="min-h-10 rounded-md border border-border px-3 text-sm" /></label>
    {urlError ? <p id={errorId} role="alert" className="text-sm text-danger-strong">{urlError}</p> : null}
    <label className="grid gap-1.5 text-sm font-medium text-text-primary">Description<textarea value={description} onChange={(event) => onDescriptionChange(event.target.value)} rows={4} className="rounded-md border border-border px-3 py-2 text-sm" /></label>
  </>;
}
