"use client";

import { ChevronRight, ExternalLink, FileAudio, FileImage, FileText, FileVideo, GripVertical, MoreHorizontal, Plus } from "lucide-react";
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, useState } from "react";
import Image from "next/image";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AuthoringSectionHeader } from "@/components/shared/authoring-section-header";
import { RichTextSummary } from "@/components/shared/rich-text-summary";
import { VideoLinkFields } from "@/components/shared/video-link-fields";
import { richTextBlockIsComplete, videoLinkIsComplete } from "@/components/shared/authoring-completion";

import { duplicateStagedBlock, libraryResourceBlockIsComplete, newLibraryResourceBlock, newStagedBlock, removeStagedBlock, selectLibraryResource, type StagedMaterialBlock } from "./editor-model";
import { isValidMaterialUrl, materialPreview } from "./model";
import { RichTextBlockAuthoring } from "./rich-text-block-authoring";
import type { MaterialBlockType } from "./types";
import { moveStagedBlockWithinType } from "./editor-model";
import { SessionResourcePicker } from "./session-resource-picker";
import { formatResourceFileSize, formatResourceFileType, type ResourceCategory } from "@/features/resource-library/policy";
import type { ResourceLibraryItem } from "@/features/resource-library/presentation";
import { refreshSessionResourceAccess } from "./resource-actions";

type UpdateBlocks = (update: (blocks: StagedMaterialBlock[]) => StagedMaterialBlock[]) => void;

export function SessionMaterialEditor({ blocks, archived, updateBlocks }: { blocks: StagedMaterialBlock[]; archived: boolean; updateBlocks: UpdateBlocks }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ category: ResourceCategory; blockKey: string } | null>(null);
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const editing = blocks.find((block) => block.key === editingKey);

  function add(blockType: MaterialBlockType) {
    const block = newStagedBlock(blockType);
    updateBlocks((current) => [...current, block]);
    setEditingKey(block.key);
    setCreatingKey(blockType === "rich_text" ? null : block.key);
    setMessage(null);
    setDrawerOpen(false);
  }

  function addLibraryResource(category: ResourceCategory) {
    const block = newLibraryResourceBlock(category);
    updateBlocks((current) => [...current, block]);
    setEditingKey(block.key);
    setCreatingKey(block.key);
    setMessage(null);
    setDrawerOpen(false);
  }

  function patch(key: string, change: Partial<StagedMaterialBlock>) {
    updateBlocks((current) => current.map((block) => block.key === key ? { ...block, ...change } : block));
    setMessage(null);
  }

  function selectResource(resource: ResourceLibraryItem) {
    if (!picker || resource.category !== picker.category || resource.archivedAt) return;
    const blockKey = picker.blockKey;
    updateBlocks((current) => current.map((block) => block.key === blockKey ? selectLibraryResource(block, resource) : block));
    if (resource.category === "image") refreshSessionResourceAccess([resource.id]).then((access) => {
      updateBlocks((current) => current.map((block) => block.resourceId === resource.id && block.resource
        ? { ...block, resource: { ...block.resource, previewUrl: access[resource.id] } } : block));
    }).catch(() => {});
    setPicker(null);
  }

  function done() {
    if (editing?.blockType === "rich_text" && !richTextBlockIsComplete(editing.title, editing.richTextContent)) return;
    if (editing?.blockType === "video_link" && !videoLinkIsComplete(editing, isValidMaterialUrl)) {
      setMessage("Enter a valid http or https URL.");
      return;
    }
    if (editing?.blockType === "library_resource" && !libraryResourceBlockIsComplete(editing)) return;
    if (!editing) return;
    setEditingKey(null);
    setCreatingKey(null);
    setMessage(null);
  }

  function cancelNewBlock() {
    if (!creatingKey) return;
    updateBlocks((current) => removeStagedBlock(current, creatingKey));
    setEditingKey(null);
    setCreatingKey(null);
    setPicker(null);
    setMessage(null);
  }

  const pages = blocks.filter((block) => block.blockType === "rich_text");
  const resources = blocks.filter((block) => block.blockType !== "rich_text");
  const openEditing = editing ? <MaterialForm block={editing} patch={(change) => patch(editing.key, change)} done={done} message={message}
    showCancel={creatingKey === editing.key} cancel={cancelNewBlock} chooseResource={() => {
      if (editing.blockType === "library_resource" && editing.resourceCategory) setPicker({ category: editing.resourceCategory, blockKey: editing.key });
    }} /> : null;

  return <section className="mt-6 grid gap-8" aria-labelledby="session-material-heading">
    <AuthoringSectionHeader headingId="session-material-heading" title="Session Material" description="Build and organize the material participants will use."
      action={!archived && !editing ? <button type="button" onClick={() => add("rich_text")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white focus-visible:bg-brand-primary/90"><Plus className="size-4" aria-hidden="true" />Add Page</button> : undefined} />

    <section aria-labelledby="session-pages-heading">
      <AuthoringSectionHeader headingId="session-pages-heading" title="Pages" description="Create and organize the reading material for this Session." />
      {editing?.blockType === "rich_text" ? openEditing : pages.length ? <MaterialRows blockType="rich_text" blocks={pages} archived={archived} updateBlocks={updateBlocks} edit={setEditingKey} /> : <p className="mt-4 rounded-md border border-dashed border-border p-5 text-sm text-text-muted">No Pages yet.</p>}
    </section>
    <section aria-labelledby="session-resources-heading">
      <AuthoringSectionHeader headingId="session-resources-heading" title="Resources" description="Add supporting videos, links, and other resources for this Session."
        action={!archived && !editing ? <button type="button" onClick={() => setDrawerOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold text-brand-primary hover:bg-surface-muted focus-visible:bg-sidebar-accent"><Plus className="size-4" aria-hidden="true" />Add Resource</button> : undefined} />
      {editing && editing.blockType !== "rich_text" ? openEditing : resources.length ? <MaterialRows blockType="library_resource" blocks={resources} archived={archived} updateBlocks={updateBlocks} edit={setEditingKey} replace={(block) => { if (block.resourceCategory) setPicker({ category: block.resourceCategory, blockKey: block.key }); }} /> : <p className="mt-4 rounded-md border border-dashed border-border p-5 text-sm text-text-muted">No Resources yet.</p>}
    </section>

    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}><SheetContent side="right" className="overflow-y-auto p-0">
      <SheetHeader className="border-b border-border px-6 py-5"><SheetTitle>Add Resource</SheetTitle><SheetDescription>Choose a resource type to add.</SheetDescription></SheetHeader>
      <div className="grid gap-3 p-6">
        <Chooser icon={<FileImage className="size-5" />} title="Image" description="Add an image Resource block." onClick={() => addLibraryResource("image")} />
        <Chooser icon={<FileText className="size-5" />} title="Document" description="Add a document Resource block." onClick={() => addLibraryResource("document")} />
        <Chooser icon={<FileAudio className="size-5" />} title="Audio" description="Add an audio Resource block." onClick={() => addLibraryResource("audio")} />
        <Chooser icon={<FileVideo className="size-5" />} title="Video" description="Add an uploaded video Resource block." onClick={() => addLibraryResource("video")} />
        <Chooser icon={<FileVideo className="size-5" />} title="Video / Link" description="Add a video or external link." onClick={() => add("video_link")} />
      </div>
    </SheetContent></Sheet>
    {picker ? <SessionResourcePicker key={`${picker.category}:${picker.blockKey}`} category={picker.category} onClose={() => setPicker(null)} onSelect={selectResource} /> : null}
  </section>;
}

function Chooser({ icon, title, description, onClick }: { icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-md border border-border p-4 text-left hover:bg-surface-muted"><span className="text-brand-primary">{icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-text-primary">{title}</span><span className="mt-1 block text-xs text-text-muted">{description}</span></span><ChevronRight className="size-4 text-text-muted" aria-hidden="true" /></button>;
}

function MaterialForm({ block, patch, done, message, showCancel, cancel, chooseResource }: { block: StagedMaterialBlock; patch: (change: Partial<StagedMaterialBlock>) => void; done: () => void; message: string | null; showCancel: boolean; cancel: () => void; chooseResource: () => void }) {
  const category = block.resourceCategory;
  const label = category ? category[0].toUpperCase() + category.slice(1) : "Resource";
  return <div className="mt-5 grid gap-4 rounded-md border border-border bg-white p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">{block.blockType === "rich_text" ? "Page" : block.blockType === "video_link" ? "Video / Link" : label}</p>
    {block.blockType === "rich_text" ? <RichTextBlockAuthoring title={block.title} content={block.richTextContent ?? { type: "doc", content: [] }}
      onTitleChange={(title) => patch({ title })} onContentChange={(richTextContent) => patch({ richTextContent })} onDone={done} doneLabel="Done editing" />
      : block.blockType === "video_link" ? <><VideoLinkFields title={block.title} url={block.url} description={block.description}
      onTitleChange={(title) => patch({ title })} onUrlChange={(url) => patch({ url })}
      onDescriptionChange={(description) => patch({ description })} urlError={message} />
    <div className="flex justify-end gap-2">{showCancel ? <button type="button" onClick={cancel} className="min-h-10 rounded-md px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted focus-visible:bg-sidebar-accent">Cancel</button> : null}<button type="button" onClick={done} disabled={!videoLinkIsComplete(block, isValidMaterialUrl)} className="min-h-10 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:bg-brand-primary/90">Done editing</button></div></>
      : block.blockType === "library_resource" ? <>
        <div className="flex items-center gap-3 rounded-md border border-border p-3">
          {category === "image" && block.resource?.previewUrl ? <Image unoptimized src={block.resource.previewUrl} alt="" width={64} height={64} className="size-16 shrink-0 rounded object-cover" /> : <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded bg-surface-muted text-brand-primary">{category === "image" ? <FileImage className="size-7" /> : category === "document" ? <FileText className="size-7" /> : category === "audio" ? <FileAudio className="size-7" /> : <FileVideo className="size-7" />}</span>}
          {block.resource ? <span className="min-w-0"><span className="block truncate text-sm font-semibold text-text-primary">{block.resource.title}</span><span className="mt-1 block truncate text-xs text-text-muted">{formatResourceFileType(block.resource.currentVersion.mimeType)} · {formatResourceFileSize(block.resource.currentVersion.sizeBytes)}</span></span> : <p className="text-sm text-text-muted">No {category ?? "Resource"} selected.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2"><button type="button" onClick={chooseResource} className="min-h-10 rounded-md border border-border px-4 py-2 text-sm font-semibold text-brand-primary hover:bg-surface-muted focus-visible:bg-sidebar-accent">Choose {label}</button>{showCancel ? <button type="button" onClick={cancel} className="min-h-10 rounded-md px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted focus-visible:bg-sidebar-accent">Cancel</button> : null}<button type="button" onClick={done} disabled={!libraryResourceBlockIsComplete(block)} className="min-h-10 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:bg-brand-primary/90">Done editing</button></div>
      </> : null}
  </div>;
}

function MaterialRows({ blockType, blocks, archived, updateBlocks, edit, replace }: { blockType: MaterialBlockType; blocks: StagedMaterialBlock[]; archived: boolean; updateBlocks: UpdateBlocks; edit: (key: string) => void; replace?: (block: StagedMaterialBlock) => void }) {
  const dndContextId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }));
  const keys = blocks.map((block) => block.key);
  function move(activeKey: string, overKey: string) { updateBlocks((current) => moveStagedBlockWithinType(current, blockType, activeKey, overKey)); }
  function onDragEnd({ active, over }: DragEndEvent) { if (over && active.id !== over.id) move(String(active.id), String(over.id)); }
  return <DndContext id={dndContextId} sensors={sensors} onDragEnd={onDragEnd}><SortableContext items={keys} strategy={verticalListSortingStrategy}><div className="mt-5 grid gap-3">
    {blocks.map((block, index) => <MaterialRow key={block.key} block={block} index={index} count={blocks.length} keys={keys} archived={archived}
      edit={() => edit(block.key)} replace={() => replace?.(block)} move={move} duplicate={() => updateBlocks((current) => duplicateStagedBlock(current, block.key))}
      remove={() => updateBlocks((current) => removeStagedBlock(current, block.key))} />)}
  </div></SortableContext></DndContext>;
}

function MaterialRow({ block, index, count, keys, archived, edit, replace, move, duplicate, remove }: {
  block: StagedMaterialBlock; index: number; count: number; keys: string[]; archived: boolean;
  edit: () => void; replace: () => void; move: (activeKey: string, overKey: string) => void; duplicate: () => void; remove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.key, disabled: archived });
  const [confirming, setConfirming] = useState(false);
  const style = { transform: CSS.Transform.toString(transform), transition };
  function moveBy(direction: -1 | 1) { const target = keys[index + direction]; if (target) move(block.key, target); }
  return <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-md border border-border bg-white p-4">
    <div className="min-w-0 flex-1">{block.blockType === "rich_text" ? <>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Page</p>
      <RichTextSummary content={block.richTextContent} title={block.title} emptyText="Empty Page" />
    </> : block.blockType === "library_resource" ? <div className="flex items-center gap-3">
      {block.resourceCategory === "image" && block.resource?.previewUrl ? <Image unoptimized src={block.resource.previewUrl} alt="" width={56} height={56} className="size-14 shrink-0 rounded object-cover" />
        : <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded bg-surface-muted text-brand-primary">{block.resourceCategory === "image" ? <FileImage className="size-5" /> : block.resourceCategory === "document" ? <FileText className="size-5" /> : block.resourceCategory === "audio" ? <FileAudio className="size-5" /> : <FileVideo className="size-5" />}</span>}
      <span className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-wide text-brand-secondary">{block.resourceCategory ?? "Resource"}{block.resource?.archivedAt ? <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-text-muted">Archived</span> : null}</span>
      <span className="mt-1 block truncate text-sm font-semibold text-text-primary">{block.resource?.title ?? "Resource unavailable"}</span>
      <span className="block truncate text-xs text-text-muted">{block.resource ? `${formatResourceFileType(block.resource.currentVersion.mimeType)} · ${formatResourceFileSize(block.resource.currentVersion.sizeBytes)}` : ""}</span></span>
    </div> : <div className="flex items-center gap-3"><span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded bg-surface-muted text-brand-primary"><ExternalLink className="size-5" /></span><span className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-wide text-brand-secondary">Video / Link</span><span className="mt-1 block truncate text-sm font-semibold text-text-primary">{materialPreview(block)}</span></span></div>}</div>
    {!archived ? confirming ? <div className="flex items-center gap-2"><span className="text-sm text-text-muted">Remove this block?</span><button type="button" onClick={() => setConfirming(false)} className="min-h-9 rounded-md px-2 text-sm font-semibold hover:bg-surface-muted">Cancel</button><button type="button" onClick={remove} className="min-h-9 rounded-md px-2 text-sm font-semibold text-danger-strong hover:bg-surface-muted">{block.blockType === "library_resource" ? "Remove from Session" : "Remove"}</button></div> : <>
      {block.blockType === "library_resource" ? <a href={`/resource-library/${block.resourceId}/open`} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-md px-2 py-2 text-sm font-semibold text-brand-primary hover:bg-surface-muted">Open Resource</a> : <button type="button" onClick={edit} className="shrink-0 rounded-md px-3 py-2 text-sm font-semibold text-brand-primary hover:bg-surface-muted">Edit</button>}
      <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="Material actions" className="grid size-9 place-items-center rounded-md text-text-muted hover:bg-surface-muted"><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger><DropdownMenuContent align="end">{block.blockType === "library_resource" ? <DropdownMenuItem onSelect={replace}>Replace Selection</DropdownMenuItem> : null}<DropdownMenuItem onSelect={duplicate}>Duplicate</DropdownMenuItem><DropdownMenuItem disabled={index === 0} onSelect={() => moveBy(-1)}>Move Up</DropdownMenuItem><DropdownMenuItem disabled={index === count - 1} onSelect={() => moveBy(1)}>Move Down</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>{block.blockType === "library_resource" ? "Remove from Session" : "Delete"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <button type="button" {...attributes} {...listeners} aria-label="Drag to reorder" className="grid size-9 shrink-0 touch-none place-items-center rounded-md text-text-muted hover:bg-surface-muted"><GripVertical className="size-4" /></button>
    </> : null}
  </div>;
}
