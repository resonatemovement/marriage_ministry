"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { HomeworkEditorProvider, useHomeworkEditorState } from "@/features/homework/homework-editor-state";
import { editorStateIsDirty, initialSessionEditorState, restoreSessionEditorState, sessionEditorPageIsDirty, sessionPublishError, sessionSaveError, type SessionEditorState, type StagedMaterialBlock } from "./editor-model";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { saveSessionBuilderState } from "./save-session-state";
import { SessionMaterialEditor } from "./session-material-editor";
import { SessionWorkspaceNavigation } from "./session-workspace-navigation";
import { eligibleInternalNavigation } from "./navigation-guard";
import type { SessionWorkspace } from "./workspace";
import type { SessionMaterialBlock, SessionSummary } from "./types";

export function SessionEditor({ session, blocks = [], activeWorkspace = "material", homework }: {
  session: SessionSummary | null;
  blocks?: SessionMaterialBlock[];
  activeWorkspace?: SessionWorkspace;
  homework?: ReactNode;
}) {
  return <HomeworkEditorProvider key={session?.id ?? "new-session"}><SessionEditorContent session={session} blocks={blocks} activeWorkspace={activeWorkspace} homework={homework} /></HomeworkEditorProvider>;
}

function SessionEditorContent({ session, blocks, activeWorkspace, homework }: {
  session: SessionSummary | null;
  blocks: SessionMaterialBlock[];
  activeWorkspace: SessionWorkspace;
  homework?: ReactNode;
}) {
  const router = useRouter();
  const homeworkEditor = useHomeworkEditorState();
  const { dirty: homeworkDirty } = homeworkEditor;
  const [editor, setEditor] = useState<SessionEditorState>(() => initialSessionEditorState(session, blocks));
  const [baseline, setBaseline] = useState<SessionEditorState>(() => initialSessionEditorState(session, blocks));
  const [pending, startTransition] = useTransition();
  const pendingRef = useRef(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingDestinationRef = useRef<string | null>(null);
  const bypassDestinationRef = useRef<string | null>(null);
  const dirty = editorStateIsDirty(editor, baseline);
  const pageDirty = sessionEditorPageIsDirty(dirty, homeworkDirty);
  const archived = editor.status === "archived";
  const saveError = editor.status === "published" ? sessionPublishError(editor) : sessionSaveError(editor);
  const publishError = sessionPublishError(editor);
  const firstSave = editor.sessionId === null;

  useEffect(() => {
    if (!pageDirty) return;
    function warnOnUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnOnUnload);
    return () => window.removeEventListener("beforeunload", warnOnUnload);
  }, [pageDirty]);

  useEffect(() => {
    if (!pageDirty) return;
    function interceptInternalNavigation(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a");
      if (!link) return;
      const destination = eligibleInternalNavigation({
        href: link.href,
        currentHref: window.location.href,
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        target: link.target,
        download: link.hasAttribute("download"),
        sessionId: editor.sessionId ?? session?.id ?? undefined,
      });
      if (!destination) return;
      if (bypassDestinationRef.current === destination) {
        bypassDestinationRef.current = null;
        return;
      }
      event.preventDefault();
      pendingDestinationRef.current = destination;
      setDiscardOpen(true);
    }
    document.addEventListener("click", interceptInternalNavigation, true);
    return () => document.removeEventListener("click", interceptInternalNavigation, true);
  }, [pageDirty, editor.sessionId, session?.id]);

  function updateBlocks(update: (current: StagedMaterialBlock[]) => StagedMaterialBlock[]) {
    setEditor((current) => ({ ...current, blocks: update(current.blocks) }));
  }

  function save(intent: "save" | "publish" | "publish_changes") {
    if (pendingRef.current || archived) return;
    const validation = intent === "publish" ? publishError : intent === "publish_changes" || (!dirty && !firstSave) ? null : saveError;
    if (validation) { toast.error(validation); return; }
    pendingRef.current = true;
    const submitted = editor;
    startTransition(async () => {
      try {
        const result = await saveSessionBuilderState(submitted, homeworkEditor.state, {
          intent,
          saveSession: intent === "publish" || dirty,
          saveHomework: homeworkDirty,
          publishHomework: intent === "publish" || intent === "publish_changes",
        });
        if ("error" in result) { toast.error(result.error); return; }
        const next = result.sessionState ? {
          sessionId: result.sessionState.sessionId,
          status: result.sessionState.status,
          title: result.sessionState.title,
          blocks: result.sessionState.blocks,
        } satisfies SessionEditorState : null;
        if (next) { setEditor(next); setBaseline(next); }
        if ((homeworkDirty || intent !== "save") && result.homework.versionId) {
          homeworkEditor.acceptPersisted(result.homework.versionId, result.homework.blocks, result.homework.status ?? "draft");
        }
        toast.success(intent === "publish" ? "Session published" : intent === "publish_changes" ? "Homework changes published" : firstSave ? "Session draft saved" : "Session changes saved");
        if (firstSave && next) router.replace(`/session-builder/${next.sessionId}`);
      } catch {
        toast.error("The Session could not be saved. Please try again.");
      } finally {
        pendingRef.current = false;
      }
    });
  }

  function discardLocalChanges() {
    setEditor(restoreSessionEditorState(baseline));
  }

  return <div inert={pending} aria-busy={pending}>
    <div className="grid gap-5">
      <label className="grid gap-1.5 text-sm font-medium text-text-primary">Session title
        <input value={editor.title} onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value }))} autoFocus={firstSave} maxLength={180} disabled={archived} className="min-h-10 rounded-md border border-border bg-white px-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/20 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted" />
      </label>
    </div>

    {editor.sessionId ? <SessionWorkspaceNavigation sessionId={editor.sessionId} activeWorkspace={activeWorkspace} /> : null}
    {activeWorkspace === "material" || !editor.sessionId
      ? <SessionMaterialEditor blocks={editor.blocks} archived={archived} updateBlocks={updateBlocks} />
      : homework}

    <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
      {pageDirty ? <span role="status" className="mr-auto text-xs font-medium text-text-muted">Unsaved changes</span> : null}
      {firstSave ? <button type="button" onClick={() => router.push("/session-builder")} className="min-h-10 rounded-md px-3 py-2 text-sm font-semibold text-text-muted transition hover:bg-surface-muted hover:text-text-primary">Cancel</button> : <button type="button" onClick={() => { discardLocalChanges(); homeworkEditor.discard(); }} disabled={!pageDirty || pending} className="min-h-10 rounded-md px-3 py-2 text-sm font-semibold text-text-muted transition hover:bg-surface-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50">Discard Changes</button>}
      {!archived ? <>
        <button type="button" onClick={() => save("save")} disabled={pending || Boolean((dirty || firstSave) && saveError) || (!firstSave && !pageDirty)} className="min-h-10 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:opacity-60">
          {pending ? "Saving..." : firstSave ? "Save Draft" : "Save Changes"}
        </button>
        {editor.status === "draft" ? <button type="button" onClick={() => save("publish")} disabled={pending || Boolean(publishError)} className="min-h-10 rounded-md border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary transition hover:bg-surface-muted disabled:opacity-60">Publish Session</button> : homeworkEditor.state.versionStatus === "draft" && homeworkEditor.state.baseline.length > 0 ? <button type="button" onClick={() => save("publish_changes")} disabled={pending} className="min-h-10 rounded-md border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary transition hover:bg-surface-muted disabled:opacity-60">Publish Changes</button> : null}
      </> : null}
    </div>

    <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle><AlertDialogDescription>You have changes that haven’t been saved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => { pendingDestinationRef.current = null; }}>Keep Editing</AlertDialogCancel><AlertDialogAction onClick={() => { const destination = pendingDestinationRef.current; pendingDestinationRef.current = null; setDiscardOpen(false); if (destination) { bypassDestinationRef.current = destination; router.push(destination); queueMicrotask(() => { if (bypassDestinationRef.current === destination) bypassDestinationRef.current = null; }); } }}>Discard Changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </div>;
}
