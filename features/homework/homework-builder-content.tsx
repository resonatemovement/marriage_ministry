"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, GripVertical, Link2, MoreHorizontal, Plus, TextCursorInput } from "lucide-react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AuthoringSectionHeader } from "@/components/shared/authoring-section-header";
import { RichTextSummary } from "@/components/shared/rich-text-summary";
import { VideoLinkFields } from "@/components/shared/video-link-fields";
import { richTextBlockIsComplete, videoLinkIsComplete } from "@/components/shared/authoring-completion";
import { RichTextBlockAuthoring } from "@/features/session-builder/rich-text-block-authoring";
import { isDeleteConfirmation } from "@/components/shared/destructive-confirmation";
import type { Json } from "@/types/database.generated";
import { HOMEWORK_AUTHORING_BLOCK_TYPES, homeworkMoveTarget } from "./homework-editor-model";
import { useHomeworkEditorState } from "./homework-editor-state";
import { isValidHomeworkVideoUrl } from "./homework-url";
import type { HomeworkDraftLoadResult } from "./queries";

function errorMessage(error: "withdrawn" | "unavailable") {
  return error === "withdrawn"
    ? "Homework for this Session has been withdrawn and cannot be edited."
    : "Homework could not be loaded. Please try again.";
}

export function HomeworkBuilderContent({ result }: { result: HomeworkDraftLoadResult }) {
  const router = useRouter();
  const homeworkEditor = useHomeworkEditorState();
  const { initialize } = homeworkEditor;
  const [retryCount, setRetryCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [urlMessage, setUrlMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const lastToastKey = useRef<string | null>(null);
  const error = "error" in result ? result.error : null;
  const message = error ? errorMessage(error) : null;

  useEffect(() => {
    if (!message) return;
    const key = `${retryCount}:${message}`;
    if (lastToastKey.current === key) return;
    lastToastKey.current = key;
    toast.error(message);
  }, [message, retryCount]);

  useEffect(() => {
    if ("draft" in result && result.draft.id) initialize(result.draft.id, result.draft.blocks, result.draft.status);
  }, [initialize, result]);

  if (error) {
    return <section aria-labelledby="homework-builder-heading" className="mt-6">
      <h2 id="homework-builder-heading" className="font-heading text-xl font-bold text-text-primary">Homework</h2>
      <div role="alert" className="mt-5 rounded-md border border-danger-strong/30 bg-white p-6">
        <p className="text-sm text-danger-strong">{message}</p>
        {error === "unavailable" ? <button type="button" onClick={() => { setRetryCount((count) => count + 1); router.refresh(); }} className="mt-4 min-h-10 rounded-md px-3 py-2 text-sm font-semibold text-brand-primary hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:text-brand-primary">Try again</button> : null}
      </div>
    </section>;
  }

  if (!("draft" in result)) return null;

  if (homeworkEditor.state.versionId !== result.draft.id) {
    return <section aria-labelledby="homework-builder-heading" className="mt-6"><h2 id="homework-builder-heading" className="font-heading text-xl font-bold text-text-primary">Homework</h2><p className="mt-5 text-sm text-text-muted" role="status">Loading Homework content…</p></section>;
  }

  const { blocks, editingKey } = homeworkEditor.state;
  const editing = blocks.find((block) => block.key === editingKey);
  const richText = isRichTextContent(editing?.richTextContent) ? editing.richTextContent : { type: "doc", content: [{ type: "paragraph" }] };

  function addBlock(type: typeof HOMEWORK_AUTHORING_BLOCK_TYPES[number]) {
    homeworkEditor.addBlock(type);
    setUrlMessage(null);
    setDrawerOpen(false);
  }

  function finishEditing() {
    if (!editing) return;
    if (editing.blockType === "rich_text" && !richTextBlockIsComplete(editing.title, editing.richTextContent)) return;
    if (editing.blockType === "long_answer" && !richTextBlockIsComplete(null, editing.richTextContent, false)) return;
    if (editing.blockType === "video_link" && !videoLinkIsComplete({ title: editing.title ?? "", url: editing.url ?? "", description: editing.description ?? "" }, isValidHomeworkVideoUrl)) {
      setUrlMessage("Enter a valid http or https URL.");
      return;
    }
    setUrlMessage(null);
    homeworkEditor.finishEditing();
  }

  function patchEditing(update: Parameters<typeof homeworkEditor.updateBlock>[1]) {
    if (update.url !== undefined) setUrlMessage(null);
    homeworkEditor.updateBlock(editing!.key, update);
  }

  function requestDelete(blockKey: string) {
    setDeleteConfirmation("");
    setDeleteTarget(blockKey);
  }

  function closeDeleteDialog(open: boolean) {
    if (!open) {
      setDeleteTarget(null);
      setDeleteConfirmation("");
    }
  }

  function confirmDelete() {
    if (!deleteTarget || !isDeleteConfirmation(deleteConfirmation)) return;
    homeworkEditor.deleteBlock(deleteTarget, deleteConfirmation);
    closeDeleteDialog(false);
  }

  return <section aria-labelledby="homework-builder-heading" className="mt-6">
    <AuthoringSectionHeader headingId="homework-builder-heading" title="Homework" description="Build the homework participants will complete for this Session."
      action={!editing ? <button type="button" onClick={() => setDrawerOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white focus-visible:bg-brand-primary/90"><Plus className="size-4" aria-hidden="true" />Add Content</button> : undefined} />
    <div className="mt-5">
      {blocks.length === 0 ? <div className="rounded-md border border-dashed border-border p-6"><h3 className="font-heading text-base font-bold text-text-primary">No homework content yet.</h3><p className="mt-2 text-sm text-text-muted">Add readings, videos, and questions to this Homework.</p></div> : null}
      {editing ? <div className="mt-5 grid gap-4 rounded-md border border-border bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">{blockTypeLabel(editing.blockType)}</p>
        {editing.blockType === "video_link" ? <><VideoLinkFields title={editing.title ?? ""} url={editing.url ?? ""} description={editing.description ?? ""}
          onTitleChange={(title) => patchEditing({ title: title || null })} onUrlChange={(url) => patchEditing({ url })}
          onDescriptionChange={(description) => patchEditing({ description: description || null })} urlError={urlMessage} />
        <div className="flex justify-end"><button type="button" onClick={finishEditing} disabled={!videoLinkIsComplete({ title: editing.title ?? "", url: editing.url ?? "", description: editing.description ?? "" }, isValidHomeworkVideoUrl)} className="min-h-10 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:bg-brand-primary/90">Done</button></div></>
          : <RichTextBlockAuthoring title={editing.blockType === "rich_text" ? editing.title : null} content={richText as Record<string, unknown>}
            onTitleChange={editing.blockType === "rich_text" ? (title) => patchEditing({ title: title || null }) : undefined}
            onContentChange={(richTextContent) => patchEditing({ richTextContent: richTextContent as Json })}
            onDone={finishEditing} requireTitle={editing.blockType === "rich_text"} doneLabel="Done" />}
      </div> : blocks.length ? <HomeworkRows blocks={blocks}
        edit={(key) => { setUrlMessage(null); homeworkEditor.setEditingKey(key); }}
        duplicate={(key) => homeworkEditor.duplicateBlock(key)}
        requestDelete={requestDelete}
        reorder={homeworkEditor.reorderBlocks} /> : null}
    </div>
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}><SheetContent side="right" className="overflow-y-auto p-0"><SheetHeader className="border-b border-border px-6 py-5"><SheetTitle>Add Content</SheetTitle><SheetDescription>Choose the type of Homework content to add.</SheetDescription></SheetHeader><div className="grid gap-3 p-6">{HOMEWORK_AUTHORING_BLOCK_TYPES.map((type) => <button key={type} type="button" onClick={() => addBlock(type)} className="flex items-center gap-3 rounded-md border border-border p-4 text-left hover:bg-surface-muted">{type === "rich_text" ? <FileText className="size-5 text-brand-primary" aria-hidden="true" /> : type === "video_link" ? <Link2 className="size-5 text-brand-primary" aria-hidden="true" /> : <TextCursorInput className="size-5 text-brand-primary" aria-hidden="true" />}<span className="text-sm font-semibold text-text-primary">{blockTypeLabel(type)}</span></button>)}</div></SheetContent></Sheet>
    <AlertDialog open={deleteTarget !== null} onOpenChange={closeDeleteDialog}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Delete this Homework block?</AlertDialogTitle><AlertDialogDescription>This removal is staged until you save the authoring changes.</AlertDialogDescription></AlertDialogHeader>
        <label htmlFor="homework-delete-confirmation" className="mt-4 grid gap-2 text-sm font-medium">Type <span className="font-mono font-bold text-danger-strong">DELETE</span> to confirm
          <input id="homework-delete-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" className="min-h-10 rounded-md border border-border bg-white px-3 font-mono text-sm" />
        </label>
        <AlertDialogFooter><AlertDialogCancel onClick={() => closeDeleteDialog(false)}>Cancel</AlertDialogCancel><AlertDialogAction disabled={!isDeleteConfirmation(deleteConfirmation)} onClick={(event) => { event.preventDefault(); confirmDelete(); }}>Delete block</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}

function HomeworkRows({ blocks, edit, duplicate, requestDelete, reorder }: {
  blocks: ReturnType<typeof useHomeworkEditorState>["state"]["blocks"];
  edit: (key: string) => void;
  duplicate: (key: string) => void;
  requestDelete: (key: string) => void;
  reorder: (activeKey: string, overKey: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) reorder(String(active.id), String(over.id));
  }
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
    <SortableContext items={blocks.map((block) => block.key)} strategy={verticalListSortingStrategy}>
      <div className="mt-4 grid gap-3">{blocks.map((block) => <HomeworkRow key={block.key} block={block} blocks={blocks} reorder={reorder} edit={edit} duplicate={duplicate} requestDelete={requestDelete} />)}</div>
    </SortableContext>
  </DndContext>;
}

function HomeworkRow({ block, blocks, reorder, edit, duplicate, requestDelete }: {
  blocks: ReturnType<typeof useHomeworkEditorState>["state"]["blocks"];
  block: ReturnType<typeof useHomeworkEditorState>["state"]["blocks"][number];
  reorder: (activeKey: string, overKey: string) => void;
  edit: (key: string) => void;
  duplicate: (key: string) => void;
  requestDelete: (key: string) => void;
}) {
  const supported = HOMEWORK_AUTHORING_BLOCK_TYPES.some((type) => type === block.blockType);
  const moveUpTarget = homeworkMoveTarget(blocks, block.key, -1);
  const moveDownTarget = homeworkMoveTarget(blocks, block.key, 1);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.key, disabled: !supported });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return <article ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-md border border-border bg-white p-4">
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">{blockTypeLabel(block.blockType)}</p>
      {block.blockType === "rich_text" && isRichTextContent(block.richTextContent) ? <RichTextSummary content={block.richTextContent} title={block.title} emptyText="Empty Rich Text block" />
        : block.blockType === "long_answer" && isRichTextContent(block.richTextContent) ? <RichTextSummary content={block.richTextContent} title={block.title} emptyText="Empty Long Answer prompt" />
          : block.blockType === "video_link" ? <><h4 className="mt-1 truncate text-sm font-semibold text-text-primary">{block.title || "Untitled Video / Link"}</h4><div className="mt-3 grid gap-1 text-sm text-text-muted">{block.url ? <p className="break-all">{block.url}</p> : <p>Video / Link URL not set</p>}{block.description ? <p>{block.description}</p> : null}</div></>
            : <p className="mt-3 text-sm text-text-muted">This block is preserved and is not editable in this pass.</p>}
    </div>
    {supported ? <>
      <button type="button" onClick={() => edit(block.key)} className="shrink-0 rounded-md px-3 py-2 text-sm font-semibold text-brand-primary hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:text-brand-primary">Edit</button>
      <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`Actions for ${blockTypeLabel(block.blockType)} block`} className="grid size-9 place-items-center rounded-md text-text-muted hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:text-brand-primary"><MoreHorizontal className="size-4" aria-hidden="true" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => duplicate(block.key)}>Duplicate</DropdownMenuItem><DropdownMenuItem disabled={!moveUpTarget} onSelect={() => { if (moveUpTarget) reorder(block.key, moveUpTarget); }}>Move Up</DropdownMenuItem><DropdownMenuItem disabled={!moveDownTarget} onSelect={() => { if (moveDownTarget) reorder(block.key, moveDownTarget); }}>Move Down</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => requestDelete(block.key)}>Delete</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
      <button type="button" {...attributes} {...listeners} aria-label={`Reorder ${blockTypeLabel(block.blockType)} block`} className="grid size-9 shrink-0 touch-none place-items-center rounded-md text-text-muted hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:text-brand-primary"><GripVertical className="size-4" aria-hidden="true" /></button>
    </> : null}
  </article>;
}

function blockTypeLabel(blockType: string) {
  if (blockType === "rich_text") return "Rich Text";
  if (blockType === "video_link") return "Video / Link";
  if (blockType === "long_answer") return "Long Answer";
  return blockType;
}

function isRichTextContent(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
