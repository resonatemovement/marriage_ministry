"use client";

import { ChevronRight, FileText, GripVertical, MoreHorizontal, Plus, Video } from "lucide-react";
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, useState } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AuthoringSectionHeader } from "@/components/shared/authoring-section-header";
import { RichTextSummary } from "@/components/shared/rich-text-summary";
import { VideoLinkFields } from "@/components/shared/video-link-fields";
import { richTextBlockIsComplete, videoLinkIsComplete } from "@/components/shared/authoring-completion";

import { duplicateStagedBlock, moveStagedBlock, newStagedBlock, type StagedMaterialBlock } from "./editor-model";
import { isValidMaterialUrl, materialPreview } from "./model";
import { RichTextBlockAuthoring } from "./rich-text-block-authoring";
import type { MaterialBlockType } from "./types";

type UpdateBlocks = (update: (blocks: StagedMaterialBlock[]) => StagedMaterialBlock[]) => void;

export function SessionMaterialEditor({ blocks, archived, updateBlocks }: { blocks: StagedMaterialBlock[]; archived: boolean; updateBlocks: UpdateBlocks }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const editing = blocks.find((block) => block.key === editingKey);

  function add(blockType: MaterialBlockType) {
    const block = newStagedBlock(blockType);
    updateBlocks((current) => [...current, block]);
    setEditingKey(block.key);
    setMessage(null);
    setDrawerOpen(false);
  }

  function patch(key: string, change: Partial<StagedMaterialBlock>) {
    updateBlocks((current) => current.map((block) => block.key === key ? { ...block, ...change } : block));
    setMessage(null);
  }

  function done() {
    if (editing?.blockType === "rich_text" && !richTextBlockIsComplete(editing.title, editing.richTextContent)) return;
    if (editing?.blockType === "video_link" && !videoLinkIsComplete(editing, isValidMaterialUrl)) {
      setMessage("Enter a valid http or https URL.");
      return;
    }
    if (!editing) return;
    setEditingKey(null);
    setMessage(null);
  }

  return <section className="mt-6" aria-labelledby="session-material-heading">
    <AuthoringSectionHeader headingId="session-material-heading" title="Session Material" description="Build and organize the material participants will use."
      action={!archived && !editing ? <button type="button" onClick={() => setDrawerOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white focus-visible:bg-brand-primary/90"><Plus className="size-4" />Add Content</button> : undefined} />

    {editing ? <MaterialForm block={editing} patch={(change) => patch(editing.key, change)} done={done} message={message} />
      : blocks.length ? <MaterialRows blocks={blocks} archived={archived} updateBlocks={updateBlocks} edit={setEditingKey} />
        : <div className="mt-5 rounded-md border border-dashed border-border p-6 text-sm text-text-muted">No material has been added yet. Choose Add Content to begin.</div>}

    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}><SheetContent side="right" className="overflow-y-auto p-0">
      <SheetHeader className="border-b border-border px-6 py-5"><SheetTitle>Add Content</SheetTitle><SheetDescription>Choose the type of content to add.</SheetDescription></SheetHeader>
      <div className="grid gap-3 p-6">
        <Chooser icon={<FileText className="size-5" />} title="Rich Text" description="Write article-style session material." onClick={() => add("rich_text")} />
        <Chooser icon={<Video className="size-5" />} title="Video / Link" description="Add a YouTube video or external link." onClick={() => add("video_link")} />
      </div>
    </SheetContent></Sheet>
  </section>;
}

function Chooser({ icon, title, description, onClick }: { icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-md border border-border p-4 text-left hover:bg-surface-muted"><span className="text-brand-primary">{icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-text-primary">{title}</span><span className="mt-1 block text-xs text-text-muted">{description}</span></span><ChevronRight className="size-4 text-text-muted" aria-hidden="true" /></button>;
}

function MaterialForm({ block, patch, done, message }: { block: StagedMaterialBlock; patch: (change: Partial<StagedMaterialBlock>) => void; done: () => void; message: string | null }) {
  return <div className="mt-5 grid gap-4 rounded-md border border-border bg-white p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">{block.blockType === "rich_text" ? "Rich Text" : "Video / Link"}</p>
    {block.blockType === "rich_text" ? <RichTextBlockAuthoring title={block.title} content={block.richTextContent ?? { type: "doc", content: [] }}
      onTitleChange={(title) => patch({ title })} onContentChange={(richTextContent) => patch({ richTextContent })} onDone={done} doneLabel="Done editing" />
      : <><VideoLinkFields title={block.title} url={block.url} description={block.description}
      onTitleChange={(title) => patch({ title })} onUrlChange={(url) => patch({ url })}
      onDescriptionChange={(description) => patch({ description })} urlError={message} />
    <div className="flex justify-end"><button type="button" onClick={done} disabled={!videoLinkIsComplete(block, isValidMaterialUrl)} className="min-h-10 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:bg-brand-primary/90">Done editing</button></div></>}
  </div>;
}

function MaterialRows({ blocks, archived, updateBlocks, edit }: { blocks: StagedMaterialBlock[]; archived: boolean; updateBlocks: UpdateBlocks; edit: (key: string) => void }) {
  const dndContextId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }));
  const keys = blocks.map((block) => block.key);
  function move(activeKey: string, overKey: string) { updateBlocks((current) => moveStagedBlock(current, activeKey, overKey)); }
  function onDragEnd({ active, over }: DragEndEvent) { if (over && active.id !== over.id) move(String(active.id), String(over.id)); }
  return <DndContext id={dndContextId} sensors={sensors} onDragEnd={onDragEnd}><SortableContext items={keys} strategy={verticalListSortingStrategy}><div className="mt-5 grid gap-3">
    {blocks.map((block, index) => <MaterialRow key={block.key} block={block} index={index} count={blocks.length} keys={keys} archived={archived}
      edit={() => edit(block.key)} move={move} duplicate={() => updateBlocks((current) => duplicateStagedBlock(current, block.key))}
      remove={() => updateBlocks((current) => current.filter((item) => item.key !== block.key))} />)}
  </div></SortableContext></DndContext>;
}

function MaterialRow({ block, index, count, keys, archived, edit, move, duplicate, remove }: {
  block: StagedMaterialBlock; index: number; count: number; keys: string[]; archived: boolean;
  edit: () => void; move: (activeKey: string, overKey: string) => void; duplicate: () => void; remove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.key, disabled: archived });
  const [confirming, setConfirming] = useState(false);
  const style = { transform: CSS.Transform.toString(transform), transition };
  function moveBy(direction: -1 | 1) { const target = keys[index + direction]; if (target) move(block.key, target); }
  return <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-md border border-border bg-white p-4">
    <div className="min-w-0 flex-1">{block.blockType === "rich_text" ? <>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Rich Text</p>
      <RichTextSummary content={block.richTextContent} title={block.title} emptyText="Empty Rich Text block" />
    </> : <><p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Video / Link</p><p className="mt-1 truncate text-sm font-semibold text-text-primary">{materialPreview(block)}</p></>}</div>
    {!archived ? confirming ? <div className="flex items-center gap-2"><span className="text-sm text-text-muted">Remove this block?</span><button type="button" onClick={() => setConfirming(false)} className="min-h-9 rounded-md px-2 text-sm font-semibold hover:bg-surface-muted">Cancel</button><button type="button" onClick={remove} className="min-h-9 rounded-md px-2 text-sm font-semibold text-danger-strong hover:bg-surface-muted">Remove</button></div> : <>
      <button type="button" onClick={edit} className="shrink-0 rounded-md px-3 py-2 text-sm font-semibold text-brand-primary hover:bg-surface-muted">Edit</button>
      <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="Material actions" className="grid size-9 place-items-center rounded-md text-text-muted hover:bg-surface-muted"><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={duplicate}>Duplicate</DropdownMenuItem><DropdownMenuItem disabled={index === 0} onSelect={() => moveBy(-1)}>Move Up</DropdownMenuItem><DropdownMenuItem disabled={index === count - 1} onSelect={() => moveBy(1)}>Move Down</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <button type="button" {...attributes} {...listeners} aria-label="Drag to reorder" className="grid size-9 shrink-0 touch-none place-items-center rounded-md text-text-muted hover:bg-surface-muted"><GripVertical className="size-4" /></button>
    </> : null}
  </div>;
}
