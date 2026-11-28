"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Circle, Columns2, FileText, GripVertical, Link2, MoreHorizontal, Plus, Square, TextCursorInput, Trash2 } from "lucide-react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AuthoringSectionHeader } from "@/components/shared/authoring-section-header";
import { PageNavigation } from "@/components/shared/page-navigation";
import { RichTextSummary } from "@/components/shared/rich-text-summary";
import { VideoLinkFields } from "@/components/shared/video-link-fields";
import { videoLinkIsComplete } from "@/components/shared/authoring-completion";
import { RichTextBlockAuthoring } from "@/features/session-builder/rich-text-block-authoring";
import { RichTextEditor } from "@/features/session-builder/rich-text-editor";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { isDeleteConfirmation } from "@/components/shared/destructive-confirmation";
import type { Json } from "@/types/database.generated";
import { HOMEWORK_AUTHORING_BLOCK_TYPES, homeworkBlockIsComplete, homeworkMoveTarget, sideBySideHeadingsAreValid } from "./homework-editor-model";
import type { SideBySideResponseConfig } from "./side-by-side-response";
import { SideBySideResponseFields } from "./side-by-side-response-fields";
import { useHomeworkEditorState } from "./homework-editor-state";
import { HomeworkRichTextAuthoring } from "./homework-rich-text-authoring";
import { isValidHomeworkVideoUrl } from "./homework-url";
import type { HomeworkDraftLoadResult } from "./queries";
import { MoveToSessionMenuItem } from "@/features/session-builder/move-to-session-dialog";
import { useSessionBuilderMoveContext } from "@/features/session-builder/move-context";

function errorMessage(error: "withdrawn" | "unavailable") {
  return error === "withdrawn"
    ? "Homework for this Session has been withdrawn and cannot be edited."
    : "Homework could not be loaded. Please try again.";
}

export function HomeworkBuilderContent({ result }: { result: HomeworkDraftLoadResult }) {
  const router = useRouter();
  const homeworkEditor = useHomeworkEditorState();
  const moveContext = useSessionBuilderMoveContext();
  const { initialize } = homeworkEditor;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [urlMessage, setUrlMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deletePageTarget, setDeletePageTarget] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const error = "error" in result ? result.error : null;
  const message = error ? errorMessage(error) : null;

  useEffect(() => {
    if ("draft" in result && result.draft.id) initialize(result.draft.id, result.draft.blocks, result.draft.status, result.draft.pages);
  }, [initialize, result]);

  if (error) {
    return <section aria-labelledby="homework-builder-heading" className="mt-6">
      <h2 id="homework-builder-heading" className="font-heading text-xl font-bold text-text-primary">Homework</h2>
      <div role="alert" className="mt-5 rounded-md border border-danger-strong/30 bg-white p-6">
        <p className="text-sm text-danger-strong">{message}</p>
        {error === "unavailable" ? <button type="button" onClick={() => router.refresh()} className="mt-4 min-h-10 rounded-md px-3 py-2 text-sm font-semibold text-brand-primary hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:text-brand-primary">Try again</button> : null}
      </div>
    </section>;
  }

  if (!("draft" in result)) return null;

  if (homeworkEditor.state.versionId !== result.draft.id) {
    return <section aria-labelledby="homework-builder-heading" className="mt-6"><h2 id="homework-builder-heading" className="font-heading text-xl font-bold text-text-primary">Homework</h2><p className="mt-5 text-sm text-text-muted" role="status">Loading Homework content…</p></section>;
  }

  const { blocks, editingKey, pages, selectedPageId } = homeworkEditor.state;
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? pages[0];
  const visibleBlocks = selectedPage ? blocks.filter((block) => block.pageId === selectedPage.id) : [];
  const editingBlock = blocks.find((block) => block.key === editingKey);
  const editing = editingBlock?.pageId === selectedPage?.id ? editingBlock : undefined;
  const richText = isRichTextContent(editing?.richTextContent) ? editing.richTextContent : { type: "doc", content: [{ type: "paragraph" }] };

  function addBlock(type: typeof HOMEWORK_AUTHORING_BLOCK_TYPES[number]) {
    homeworkEditor.addBlock(type);
    setUrlMessage(null);
    setDrawerOpen(false);
  }

  function finishEditing() {
    if (!editing) return;
    if (!homeworkBlockIsComplete(editing)) return;
    if (editing.blockType === "video_link" && !videoLinkIsComplete({ title: editing.title ?? "", url: editing.url ?? "", description: editing.description ?? "" }, isValidHomeworkVideoUrl)) {
      setUrlMessage("Enter a valid http or https URL.");
      return;
    }
    setUrlMessage(null);
    homeworkEditor.finishEditing();
  }

  function cancelEditing() {
    setUrlMessage(null);
    homeworkEditor.cancelEditing();
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
    <AuthoringSectionHeader headingId="homework-builder-heading" title="Homework" description="Build the homework participants will complete for this Session." />
    <div className="mt-5 grid items-start gap-4 lg:grid-cols-[21rem_minmax(0,1fr)]">
      <PageNavigation
        ariaLabel="Homework pages"
        pages={pages.map((page, index) => ({ id: page.id, title: page.title.trim() || `Untitled Page ${index + 1}` }))}
        selectedPageId={selectedPage?.id}
        emptyMessage="No pages yet. Add a page to begin."
        onSelect={homeworkEditor.selectPage}
        onAddPage={homeworkEditor.addPage}
      />
      <div className="min-w-0 rounded-lg border border-border bg-white p-4">
        {selectedPage ? <>
          <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
            <label className="grid min-w-0 flex-1 gap-1 text-xs font-semibold text-text-muted">Page title
              <Input aria-label="Page title" maxLength={120} value={selectedPage.title} onChange={(event) => homeworkEditor.renamePage(selectedPage.id, event.target.value)} placeholder="Untitled page" />
            </label>
            <div className="flex flex-wrap items-center gap-1">
              <button type="button" aria-label="Move page up" disabled={selectedPage.position === 0} onClick={() => homeworkEditor.reorderPage(selectedPage.id, -1)} className="grid size-10 place-items-center rounded-md text-text-muted hover:bg-surface-muted disabled:opacity-40"><ArrowUp className="size-4" aria-hidden="true" /></button>
              <button type="button" aria-label="Move page down" disabled={selectedPage.position === pages.length - 1} onClick={() => homeworkEditor.reorderPage(selectedPage.id, 1)} className="grid size-10 place-items-center rounded-md text-text-muted hover:bg-surface-muted disabled:opacity-40"><ArrowDown className="size-4" aria-hidden="true" /></button>
              <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="Homework page actions" className="grid size-10 place-items-center rounded-md text-text-muted hover:bg-surface-muted"><MoreHorizontal className="size-4" aria-hidden="true" /></button></DropdownMenuTrigger><DropdownMenuContent align="end">
                {moveContext.sourceSession ? <MoveToSessionMenuItem sessions={moveContext.sessions} sourceSession={moveContext.sourceSession}
                  kind="homework_page" itemId={selectedPage.id} itemLabel={`Page ${selectedPage.position + 1}: ${selectedPage.title.trim() || "Untitled Page"}`}
                  sourceVersionId={result.draft.id} sourceVersionUpdatedAt={result.draft.updatedAt}
                  sourceIsReady={moveContext.sourceCanMove && !homeworkEditor.dirty && Boolean(result.draft.id)}
                  sourceBlockedMessage="Save or discard unsaved Homework or Session changes before moving this page."
                  onMoved={moveContext.refreshAfterMove} /> : null}
              </DropdownMenuContent></DropdownMenu>
              <button type="button" onClick={() => { setDeleteConfirmation(""); setDeletePageTarget(selectedPage.id); }} className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-danger-strong hover:bg-danger-strong/5"><Trash2 className="size-4" aria-hidden="true" />Delete Page</button>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" disabled={Boolean(editingBlock)} onClick={() => setDrawerOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:bg-brand-primary/90"><Plus className="size-4" aria-hidden="true" />Add Content</button>
          </div>
        </> : <p className="text-sm text-text-muted">Select or add a page to begin.</p>}
        <div className="mt-4 min-w-0 w-full max-w-full">
      {selectedPage && visibleBlocks.length === 0 && !editing ? <div className="rounded-md border border-dashed border-border p-6"><h3 className="font-heading text-base font-bold text-text-primary">No content on this page yet.</h3><p className="mt-2 text-sm text-text-muted">Add Homework content to this page, or save it as a draft while it is in progress.</p></div> : null}
      {editing ? <div className="mt-5 grid gap-4 rounded-md border border-border bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">{blockTypeLabel(editing.blockType)}</p>
        {editing.blockType === "side_by_side_response" && editing.sideBySideConfig ? <>
          <label className="grid gap-1.5 text-sm font-medium text-text-primary">Instructions <span className="font-normal text-text-muted">Optional</span>
            <textarea rows={3} maxLength={4000} value={editing.sideBySideConfig.instructions} onChange={(event) => patchEditing({ sideBySideConfig: { ...editing.sideBySideConfig!, instructions: event.currentTarget.value } })} className="min-h-20 resize-y rounded-md border border-border bg-white px-3 py-2 text-base" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-text-primary">Left column heading
              <Input required maxLength={180} placeholder="Left column heading" value={editing.sideBySideConfig.leftHeading} onChange={(event) => patchEditing({ sideBySideConfig: { ...editing.sideBySideConfig!, leftHeading: event.currentTarget.value } })} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-text-primary">Right column heading
              <Input required maxLength={180} placeholder="Right column heading" value={editing.sideBySideConfig.rightHeading} onChange={(event) => patchEditing({ sideBySideConfig: { ...editing.sideBySideConfig!, rightHeading: event.currentTarget.value } })} />
            </label>
          </div>
          <label htmlFor={`homework-side-by-side-required-${editing.key}`} className="flex min-h-10 items-center gap-2 text-sm font-medium text-text-primary">
            <Checkbox id={`homework-side-by-side-required-${editing.key}`} checked={editing.sideBySideConfig.bothRequired} onCheckedChange={(checked) => patchEditing({ sideBySideConfig: { ...editing.sideBySideConfig!, bothRequired: checked === true } })} />
            Both responses required
          </label>
          <SideBySidePreview config={editing.sideBySideConfig} />
          <div className="flex justify-end gap-2"><button type="button" onClick={cancelEditing} className="min-h-10 rounded-md px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted focus-visible:bg-surface-muted">Cancel</button><button type="button" onClick={finishEditing} disabled={!sideBySideHeadingsAreValid(editing.sideBySideConfig)} className="min-h-10 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:bg-brand-primary/90">Done</button></div>
        </> : editing.blockType === "video_link" ? <><VideoLinkFields title={editing.title ?? ""} url={editing.url ?? ""} description={editing.description ?? ""}
          onTitleChange={(title) => patchEditing({ title: title || null })} onUrlChange={(url) => patchEditing({ url })}
          onDescriptionChange={(description) => patchEditing({ description: description || null })} urlError={urlMessage} />
        <div className="flex justify-end gap-2"><button type="button" onClick={cancelEditing} className="min-h-10 rounded-md px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted focus-visible:bg-surface-muted">Cancel</button><button type="button" onClick={finishEditing} disabled={!videoLinkIsComplete({ title: editing.title ?? "", url: editing.url ?? "", description: editing.description ?? "" }, isValidHomeworkVideoUrl)} className="min-h-10 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:bg-brand-primary/90">Done</button></div></>
          : editing.blockType === "checkbox_question" || editing.blockType === "radio_question" ? <>
            <div className="grid gap-1.5 text-sm font-medium text-text-primary"><p>Question</p>
              <RichTextEditor content={richText as Record<string, unknown>} onChange={(richTextContent) => patchEditing({ richTextContent: richTextContent as Json })} />
            </div>
            <fieldset className="grid gap-3">
              <legend className="text-sm font-semibold text-text-primary">Answer Choices</legend>
              {editing.questionChoices.map((choice, index) => <div key={choice.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2">
                {editing.blockType === "checkbox_question" ? <Square className="size-4 shrink-0 text-text-muted" aria-hidden="true" /> : <Circle className="size-4 shrink-0 text-text-muted" aria-hidden="true" />}
                <Input aria-label={`Answer choice ${index + 1}`} value={choice.label} onChange={(event) => homeworkEditor.updateQuestionChoice(editing.key, choice.id, event.target.value)} />
                <button type="button" aria-label={`Move answer choice ${index + 1} up`} onClick={() => homeworkEditor.reorderQuestionChoices(editing.key, choice.id, -1)} disabled={index === 0} className="grid size-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"><ArrowUp className="size-4" aria-hidden="true" /></button>
                <button type="button" aria-label={`Move answer choice ${index + 1} down`} onClick={() => homeworkEditor.reorderQuestionChoices(editing.key, choice.id, 1)} disabled={index === editing.questionChoices.length - 1} className="grid size-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"><ArrowDown className="size-4" aria-hidden="true" /></button>
                <button type="button" aria-label={`Remove answer choice ${index + 1}`} onClick={() => homeworkEditor.deleteQuestionChoice(editing.key, choice.id)} className="grid size-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-muted hover:text-danger-strong"><Trash2 className="size-4" aria-hidden="true" /></button>
              </div>)}
              <button type="button" onClick={() => homeworkEditor.addQuestionChoice(editing.key)} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md px-3 text-sm font-semibold text-brand-primary hover:bg-surface-muted"><Plus className="size-4" aria-hidden="true" />Add Choice</button>
            </fieldset>
            <label htmlFor={`homework-required-${editing.key}`} className="flex min-h-10 items-center gap-2 text-sm font-medium text-text-primary">
              <Checkbox id={`homework-required-${editing.key}`} checked={editing.isRequired} onCheckedChange={(checked) => patchEditing({ isRequired: checked === true })} />
              Required question
            </label>
            <div className="flex justify-end gap-2"><button type="button" onClick={cancelEditing} className="min-h-10 rounded-md px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted focus-visible:bg-surface-muted">Cancel</button><button type="button" onClick={finishEditing} disabled={!homeworkBlockIsComplete(editing)} className="min-h-10 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:bg-brand-primary/90">Done</button></div>
          </> : editing.blockType === "rich_text" ? <HomeworkRichTextAuthoring title={editing.title} content={richText as Record<string, unknown>}
            onTitleChange={(title) => patchEditing({ title: title || null })}
            onContentChange={(richTextContent) => patchEditing({ richTextContent: richTextContent as Json })} onCancel={cancelEditing}
            onDone={finishEditing} />
            : <RichTextBlockAuthoring title={null} content={richText as Record<string, unknown>}
              onContentChange={(richTextContent) => patchEditing({ richTextContent: richTextContent as Json })} onCancel={cancelEditing}
              onDone={finishEditing} requireTitle={false} doneLabel="Done" />}
      </div> : visibleBlocks.length ? <HomeworkRows blocks={visibleBlocks} pages={pages} moveContext={moveContext} sourceVersionId={result.draft.id} sourceVersionUpdatedAt={result.draft.updatedAt} sourceIsReady={moveContext.sourceCanMove && !homeworkEditor.dirty}
        edit={(key) => { setUrlMessage(null); homeworkEditor.setEditingKey(key); }}
        duplicate={(key) => homeworkEditor.duplicateBlock(key)}
        requestDelete={requestDelete}
        moveToPage={homeworkEditor.moveBlockToPage} reorder={homeworkEditor.reorderBlocks} /> : null}
        </div>
      </div>
    </div>
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}><SheetContent side="right" className="overflow-y-auto p-0"><SheetHeader className="border-b border-border px-6 py-5"><SheetTitle>Add Content</SheetTitle><SheetDescription>Choose the type of Homework content to add.</SheetDescription></SheetHeader><div className="grid gap-3 p-6">{HOMEWORK_AUTHORING_BLOCK_TYPES.map((type) => <button key={type} type="button" onClick={() => addBlock(type)} className="flex items-center gap-3 rounded-md border border-border p-4 text-left hover:bg-surface-muted">{blockTypeIcon(type)}<span className="grid gap-1"><span className="text-sm font-semibold text-text-primary">{blockTypeLabel(type)}</span>{type === "checkbox_question" ? <span className="text-xs text-text-muted">Allow multiple answers.</span> : type === "radio_question" ? <span className="text-xs text-text-muted">Allow one answer.</span> : null}</span></button>)}</div></SheetContent></Sheet>
    <AlertDialog open={deleteTarget !== null} onOpenChange={closeDeleteDialog}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Delete this Homework block?</AlertDialogTitle><AlertDialogDescription>This removal is staged until you save the authoring changes.</AlertDialogDescription></AlertDialogHeader>
        <label htmlFor="homework-delete-confirmation" className="mt-4 grid gap-2 text-sm font-medium">Type <span className="font-mono font-bold text-danger-strong">DELETE</span> to confirm
          <input id="homework-delete-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" className="min-h-10 rounded-md border border-border bg-white px-3 font-mono text-sm" />
        </label>
        <AlertDialogFooter><AlertDialogCancel onClick={() => closeDeleteDialog(false)}>Cancel</AlertDialogCancel><AlertDialogAction disabled={!isDeleteConfirmation(deleteConfirmation)} onClick={(event) => { event.preventDefault(); confirmDelete(); }}>Delete block</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={deletePageTarget !== null} onOpenChange={(open) => { if (!open) { setDeletePageTarget(null); setDeleteConfirmation(""); } }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Delete this Homework page permanently?</AlertDialogTitle><AlertDialogDescription>The page and all of its content will be permanently removed from this draft. Published or assigned Homework and saved Couple responses are protected.</AlertDialogDescription></AlertDialogHeader>
        <label htmlFor="homework-page-delete-confirmation" className="mt-4 grid gap-2 text-sm font-medium">Type <span className="font-mono font-bold text-danger-strong">DELETE</span> to confirm
          <input id="homework-page-delete-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" className="min-h-10 rounded-md border border-border bg-white px-3 font-mono text-sm" />
        </label>
        <AlertDialogFooter><AlertDialogCancel onClick={() => { setDeletePageTarget(null); setDeleteConfirmation(""); }}>Cancel</AlertDialogCancel><AlertDialogAction disabled={!isDeleteConfirmation(deleteConfirmation)} onClick={(event) => { event.preventDefault(); if (deletePageTarget) homeworkEditor.deletePage(deletePageTarget, deleteConfirmation); setDeletePageTarget(null); setDeleteConfirmation(""); }}>Delete Permanently</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}

function HomeworkRows({ blocks, pages, moveContext, sourceVersionId, sourceVersionUpdatedAt, sourceIsReady, edit, duplicate, requestDelete, moveToPage, reorder }: {
  blocks: ReturnType<typeof useHomeworkEditorState>["state"]["blocks"];
  pages: ReturnType<typeof useHomeworkEditorState>["state"]["pages"];
  moveContext: ReturnType<typeof useSessionBuilderMoveContext>;
  sourceVersionId: string | null;
  sourceVersionUpdatedAt: string | null;
  sourceIsReady: boolean;
  edit: (key: string) => void;
  duplicate: (key: string) => void;
  requestDelete: (key: string) => void;
  moveToPage: (key: string, pageId: string) => void;
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
      <div className="mt-4 grid min-w-0 w-full max-w-full gap-3">{blocks.map((block) => <HomeworkRow key={block.key} block={block} blocks={blocks} pages={pages} reorder={reorder} edit={edit} duplicate={duplicate} requestDelete={requestDelete} moveToPage={moveToPage} moveContext={moveContext} sourceVersionId={sourceVersionId} sourceVersionUpdatedAt={sourceVersionUpdatedAt} sourceIsReady={sourceIsReady} />)}</div>
    </SortableContext>
  </DndContext>;
}

function HomeworkRow({ block, blocks, pages, reorder, edit, duplicate, requestDelete, moveToPage, moveContext, sourceVersionId, sourceVersionUpdatedAt, sourceIsReady }: {
  blocks: ReturnType<typeof useHomeworkEditorState>["state"]["blocks"];
  pages: ReturnType<typeof useHomeworkEditorState>["state"]["pages"];
  block: ReturnType<typeof useHomeworkEditorState>["state"]["blocks"][number];
  reorder: (activeKey: string, overKey: string) => void;
  edit: (key: string) => void;
  duplicate: (key: string) => void;
  requestDelete: (key: string) => void;
  moveToPage: (key: string, pageId: string) => void;
  moveContext: ReturnType<typeof useSessionBuilderMoveContext>;
  sourceVersionId: string | null;
  sourceVersionUpdatedAt: string | null;
  sourceIsReady: boolean;
}) {
  const supported = HOMEWORK_AUTHORING_BLOCK_TYPES.some((type) => type === block.blockType);
  const moveUpTarget = homeworkMoveTarget(blocks, block.key, -1);
  const moveDownTarget = homeworkMoveTarget(blocks, block.key, 1);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.key, disabled: !supported });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return <article ref={setNodeRef} style={style} className="flex w-full min-w-0 max-w-full flex-wrap items-start gap-2 rounded-md border border-border bg-white p-4 sm:flex-nowrap">
    <div className="min-w-0 w-full flex-1 basis-full [overflow-wrap:anywhere] sm:basis-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">{blockTypeLabel(block.blockType)}</p>
      {block.blockType === "rich_text" && isRichTextContent(block.richTextContent) ? <RichTextSummary content={block.richTextContent} title={block.title} emptyText="Empty Rich Text block" className="min-w-0 [overflow-wrap:anywhere]" titleClassName="mt-1 break-words text-sm font-semibold text-text-primary [overflow-wrap:anywhere]" />
        : block.blockType === "side_by_side_response" && block.sideBySideConfig ? <><div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2"><p className="break-words font-semibold text-text-primary [overflow-wrap:anywhere]">{block.sideBySideConfig.leftHeading}</p><p className="break-words font-semibold text-text-primary [overflow-wrap:anywhere]">{block.sideBySideConfig.rightHeading}</p></div><p className="mt-2 text-xs text-text-muted">{block.sideBySideConfig.bothRequired ? "Both responses required" : "Responses optional"}</p></>
        : block.blockType === "long_answer" && isRichTextContent(block.richTextContent) ? <RichTextSummary content={block.richTextContent} title={block.title} emptyText="Empty Long Answer prompt" className="min-w-0 [overflow-wrap:anywhere]" titleClassName="mt-1 break-words text-sm font-semibold text-text-primary [overflow-wrap:anywhere]" />
          : (block.blockType === "checkbox_question" || block.blockType === "radio_question") && isRichTextContent(block.richTextContent) ? <><RichTextSummary content={block.richTextContent} title={null} emptyText="Empty question" className="min-w-0 [overflow-wrap:anywhere]" /><p className="mt-2 text-xs text-text-muted">{block.questionChoices.length} choices · {block.isRequired ? "Required" : "Optional"}</p></>
          : block.blockType === "video_link" ? <><h4 className="mt-1 break-words text-sm font-semibold text-text-primary [overflow-wrap:anywhere]">{block.title || "Untitled Video / Link"}</h4><div className="mt-3 grid min-w-0 gap-1 text-sm text-text-muted">{block.url ? <p className="break-all">{block.url}</p> : <p>Video / Link URL not set</p>}{block.description ? <p className="break-words [overflow-wrap:anywhere]">{block.description}</p> : null}</div></>
            : <p className="mt-3 text-sm text-text-muted">This block is preserved and is not editable in this pass.</p>}
    </div>
    {supported ? <>
      <div className="ml-auto flex shrink-0 items-center gap-1">
      <button type="button" onClick={() => edit(block.key)} className="shrink-0 rounded-md px-3 py-2 text-sm font-semibold text-brand-primary hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:text-brand-primary">Edit</button>
      <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`Actions for ${blockTypeLabel(block.blockType)} block`} className="grid size-9 place-items-center rounded-md text-text-muted hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:text-brand-primary"><MoreHorizontal className="size-4" aria-hidden="true" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => duplicate(block.key)}>Duplicate</DropdownMenuItem><DropdownMenuItem disabled={!moveUpTarget} onSelect={() => { if (moveUpTarget) reorder(block.key, moveUpTarget); }}>Move Up</DropdownMenuItem><DropdownMenuItem disabled={!moveDownTarget} onSelect={() => { if (moveDownTarget) reorder(block.key, moveDownTarget); }}>Move Down</DropdownMenuItem>{pages.length > 1 ? <><DropdownMenuSeparator /><DropdownMenuLabel>Move to page</DropdownMenuLabel>{pages.filter((page) => page.id !== block.pageId).map((page) => <DropdownMenuItem key={page.id} onSelect={() => moveToPage(block.key, page.id)}>{page.title.trim() || `Untitled Page ${page.position + 1}`}</DropdownMenuItem>)}</> : null}{moveContext.sourceSession ? <DropdownMenuSeparator /> : null}{moveContext.sourceSession ? <MoveToSessionMenuItem sessions={moveContext.sessions} sourceSession={moveContext.sourceSession}
          kind="homework_block" itemId={block.persistedId ?? block.key} itemLabel={block.blockType === "side_by_side_response" ? "Side-by-Side Response" : blockTypeLabel(block.blockType)}
          sourceVersionId={sourceVersionId} sourceVersionUpdatedAt={sourceVersionUpdatedAt}
          sourceIsReady={sourceIsReady && Boolean(block.persistedId)} sourceBlockedMessage="Save or discard unsaved Homework or Session changes before moving this item."
          onMoved={moveContext.refreshAfterMove} /> : null}<DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => requestDelete(block.key)}>Delete</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
      <button type="button" {...attributes} {...listeners} aria-label={`Reorder ${blockTypeLabel(block.blockType)} block`} className="grid size-9 shrink-0 touch-none place-items-center rounded-md text-text-muted hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:text-brand-primary"><GripVertical className="size-4" aria-hidden="true" /></button>
      </div>
    </> : null}
  </article>;
}

function blockTypeLabel(blockType: string) {
  if (blockType === "side_by_side_response") return "Side-by-Side Response";
  if (blockType === "rich_text") return "Rich Text";
  if (blockType === "video_link") return "Video / Link";
  if (blockType === "long_answer") return "Long Answer";
  if (blockType === "checkbox_question") return "Checkbox Question";
  if (blockType === "radio_question") return "Radio Question";
  return blockType;
}

function blockTypeIcon(blockType: string) {
  if (blockType === "side_by_side_response") return <Columns2 className="size-5 text-brand-primary" aria-hidden="true" />;
  if (blockType === "rich_text") return <FileText className="size-5 text-brand-primary" aria-hidden="true" />;
  if (blockType === "video_link") return <Link2 className="size-5 text-brand-primary" aria-hidden="true" />;
  if (blockType === "checkbox_question") return <Square className="size-5 text-brand-primary" aria-hidden="true" />;
  if (blockType === "radio_question") return <Circle className="size-5 text-brand-primary" aria-hidden="true" />;
  return <TextCursorInput className="size-5 text-brand-primary" aria-hidden="true" />;
}

function SideBySidePreview({ config }: { config: Omit<SideBySideResponseConfig, "side"> }) {
  return <div className="rounded-md border border-border bg-surface-muted p-4">
    {config.instructions.trim() ? <p className="mb-3 whitespace-pre-wrap text-sm text-text-secondary">{config.instructions}</p> : null}
    <SideBySideResponseFields config={config} rows={[{ id: config.groupId, left: "", right: "" }]} readOnly />
  </div>;
}

function isRichTextContent(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
