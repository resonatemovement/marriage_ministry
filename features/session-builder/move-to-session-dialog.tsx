"use client";

import { useEffect, useState, useTransition } from "react";
import { Dialog } from "radix-ui";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { SessionSummary } from "./types";
import { getHomeworkMoveDestination, moveSessionBuilderContent, type HomeworkMoveDestination, type MoveContentInput } from "./move-content-actions";
import { announceSessionBuilderContentMoved, hasUnsavedSessionBuilderChangesInOtherTab } from "./dirty-registry";

type MoveKind = MoveContentInput["kind"];

export function MoveToSessionMenuItem({
  sessions, sourceSession, kind, itemId, itemLabel, sourceVersionId = null,
  sourceVersionUpdatedAt = null, sourceIsReady, sourceBlockedMessage, onMoved,
}: {
  sessions: SessionSummary[];
  sourceSession: SessionSummary;
  kind: MoveKind;
  itemId: string;
  itemLabel: string;
  sourceVersionId?: string | null;
  sourceVersionUpdatedAt?: string | null;
  sourceIsReady: boolean;
  sourceBlockedMessage?: string;
  onMoved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  return <>
    <DropdownMenuItem onSelect={() => { setDialogKey((value) => value + 1); setOpen(true); }}>Move to Session</DropdownMenuItem>
    <MoveToSessionDialog key={dialogKey} open={open} onOpenChange={setOpen} sessions={sessions} sourceSession={sourceSession}
      kind={kind} itemId={itemId} itemLabel={itemLabel} sourceVersionId={sourceVersionId}
      sourceVersionUpdatedAt={sourceVersionUpdatedAt}
      sourceIsReady={sourceIsReady} sourceBlockedMessage={sourceBlockedMessage} onMoved={onMoved} />
  </>;
}

function MoveToSessionDialog({ open, onOpenChange, sessions, sourceSession, kind, itemId, itemLabel,
  sourceVersionId, sourceVersionUpdatedAt, sourceIsReady, sourceBlockedMessage, onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: SessionSummary[];
  sourceSession: SessionSummary;
  kind: MoveKind;
  itemId: string;
  itemLabel: string;
  sourceVersionId: string | null;
  sourceVersionUpdatedAt: string | null;
  sourceIsReady: boolean;
  sourceBlockedMessage?: string;
  onMoved: () => void;
}) {
  const isSessionMaterial = kind === "session_material_page" || kind === "session_material_resource";
  const destinations = sessions.filter((session) => session.id !== sourceSession.id && session.status !== "archived"
    && (!isSessionMaterial || session.status === "draft"));
  const [destinationId, setDestinationId] = useState("");
  const [destinationPageId, setDestinationPageId] = useState("");
  const [destinationLookup, setDestinationLookup] = useState<{ sessionId: string; value: HomeworkMoveDestination | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const destination = destinations.find((session) => session.id === destinationId);
  const needsHomework = kind === "homework_page" || kind === "homework_block";
  const needsDestinationPage = kind === "homework_block";
  const destinationLoaded = Boolean(destinationId && destinationLookup?.sessionId === destinationId);
  const destinationHomework = destinationLoaded ? destinationLookup?.value ?? null : null;
  const hasPages = Boolean(destinationHomework?.pages.length);

  useEffect(() => {
    if (!open || !needsHomework || !destinationId) return;
    let current = true;
    getHomeworkMoveDestination(destinationId).then((result) => {
      if (!current) return;
      setDestinationLookup({ sessionId: destinationId, value: result });
    }).catch(() => {
      if (!current) return;
      setDestinationLookup({ sessionId: destinationId, value: null });
    });
    return () => { current = false; };
  }, [open, needsHomework, destinationId]);

  function move() {
    if (!destination || !sourceIsReady || pending) return;
    const dirtyInAnotherTab = hasUnsavedSessionBuilderChangesInOtherTab(destination.id);
    if (dirtyInAnotherTab !== false) {
      setError(dirtyInAnotherTab === null
        ? "This browser could not verify other Session Builder tabs. Close or save other Session Builder edits, then try again."
        : "Save or discard unsaved changes in the destination Session Builder tab before moving content.");
      return;
    }
    if (needsHomework && (!destinationLoaded || !destinationHomework)) return;
    if (needsDestinationPage && (!destinationHomework || !destinationHomework.pages.some((page) => page.id === destinationPageId))) return;

    const selectedPageId = needsDestinationPage ? destinationPageId : null;
    const input: MoveContentInput = {
      sourceSessionId: sourceSession.id,
      destinationSessionId: destination.id,
      kind,
      itemId,
      sourceSessionUpdatedAt: sourceSession.updatedAt,
      sourceHomeworkVersionId: sourceVersionId,
      sourceHomeworkUpdatedAt: sourceVersionUpdatedAt,
      destinationHomeworkVersionId: destinationHomework?.versionId ?? null,
      destinationHomeworkUpdatedAt: destinationHomework?.updatedAt ?? null,
      destinationSessionUpdatedAt: destination.updatedAt,
      destinationPageId: selectedPageId,
    };
    setError(null);
    startTransition(async () => {
      const result = await moveSessionBuilderContent(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      onMoved();
      announceSessionBuilderContentMoved([sourceSession.id, destination.id]);
    });
  }

  const canMove = Boolean(destination && sourceIsReady && !pending && (!needsHomework || (destinationLoaded && destinationHomework))
    && (!needsDestinationPage || destinationHomework?.pages.some((page) => page.id === destinationPageId)));
  const destinationHref = destination ? `/session-builder/${destination.id}?workspace=${kind.startsWith("homework") ? "homework" : "material"}` : "/session-builder";

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <Dialog.Content className="fixed inset-x-3 top-1/2 z-50 grid max-h-[90dvh] -translate-y-1/2 gap-4 overflow-y-auto rounded-xl bg-background p-5 shadow-xl sm:left-1/2 sm:right-auto sm:w-[min(520px,calc(100vw-2rem))] sm:-translate-x-1/2">
        <div className="relative pr-10">
          <Dialog.Title className="font-heading text-lg font-bold text-text-primary">Move to Session</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-text-muted">Move “{itemLabel}” and its authored content. Published content and Couple history are not changed.</Dialog.Description>
          <Dialog.Close aria-label="Close Move to Session" className="absolute right-0 top-0 grid size-9 place-items-center rounded-md text-text-muted hover:bg-surface-muted focus-visible:bg-sidebar-accent"><X className="size-4" aria-hidden="true" /></Dialog.Close>
        </div>
        <div className="grid gap-1 rounded-md bg-surface-muted/60 p-3 text-sm">
          <p><span className="font-semibold">From:</span> Session {sourceSession.curriculumNumber}: {sourceSession.title}</p>
          <p className="break-words"><span className="font-semibold">Item:</span> {itemLabel}</p>
        </div>
        {!sourceIsReady ? <p role="status" className="text-sm text-danger-strong">{sourceBlockedMessage ?? "Save or discard source edits before moving this item."}</p> : null}
        <label className="grid gap-1.5 text-sm font-semibold text-text-primary">Destination Session
          <Select value={destinationId} onValueChange={(value) => {
            setDestinationId(value);
            setDestinationLookup(null);
            setDestinationPageId("");
            setError(null);
          }}>
            <SelectTrigger aria-label="Destination Session"><SelectValue placeholder="Select a Session" /></SelectTrigger>
            <SelectContent>{destinations.map((session) => <SelectItem key={session.id} value={session.id}>Session {session.curriculumNumber}: {session.title}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        {destinations.length === 0 ? <p className="text-sm text-text-muted">{isSessionMaterial ? "No other Draft Sessions are available." : "No other eligible Sessions are available."}</p> : null}
        {needsHomework && destinationId ? !destinationLoaded ? <p role="status" className="text-sm text-text-muted">Loading editable Homework pages…</p>
          : !destinationHomework ? <p role="alert" className="text-sm text-danger-strong">Editable Homework pages could not be loaded. Reload this Session and try again.</p>
            : needsDestinationPage ? hasPages ? <label className="grid gap-1.5 text-sm font-semibold text-text-primary">Destination Homework Page
            <Select value={destinationPageId} onValueChange={(value) => { setDestinationPageId(value); setError(null); }}>
              <SelectTrigger aria-label="Destination Homework Page"><SelectValue placeholder="Select a page" /></SelectTrigger>
              <SelectContent>{destinationHomework!.pages.map((page, index) => <SelectItem key={page.id} value={page.id}>Page {index + 1}: {page.title.trim() || "Untitled Page"}</SelectItem>)}</SelectContent>
            </Select>
          </label> : <p className="text-sm text-text-muted">This Session has no eligible Homework page. Open its Homework workspace and create a page before moving this item.</p>
            : null : null}
        {error ? <p role="alert" className="text-sm text-danger-strong">{error}</p> : null}
        {success ? <div role="status" className="grid gap-3 rounded-md border border-brand-primary/30 bg-brand-primary/5 p-3 text-sm"><p>Moved successfully to Session {destination?.curriculumNumber}: {destination?.title}.</p><Link href={destinationHref} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md px-3 font-semibold text-brand-primary hover:bg-surface-muted">Open destination Session <ArrowRight className="size-4" aria-hidden="true" /></Link></div> : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          {success ? <Dialog.Close className="min-h-10 rounded-md px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted">Done</Dialog.Close> : <>
            <Dialog.Close disabled={pending} className="min-h-10 rounded-md px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted disabled:opacity-50">Cancel</Dialog.Close>
            <button type="button" onClick={move} disabled={!canMove} className="min-h-10 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Moving…" : "Move"}</button>
          </>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
