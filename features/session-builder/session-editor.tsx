"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Eye } from "lucide-react";

import { HomeworkEditorProvider, useHomeworkEditorState } from "@/features/homework/homework-editor-state";
import { editorStateIsDirty, initialSessionEditorState, restoreSessionEditorState, sessionEditorPageIsDirty, sessionPublishError, sessionSaveError, type SessionEditorState, type StagedMaterialBlock } from "./editor-model";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { saveSessionBuilderState } from "./save-session-state";
import { SessionMaterialEditor } from "./session-material-editor";
import { SessionWorkspaceNavigation } from "./session-workspace-navigation";
import { eligibleInternalNavigation } from "./navigation-guard";
import { SessionPreviewProvider, type SessionPreviewTab } from "./session-preview-context";
import { SessionPreview } from "./session-preview";
import type { SessionWorkspace } from "./workspace";
import { sessionNavigationRequest, sessionPreviewTabForWorkspace } from "./workspace";
import type { SessionMaterialBlock, SessionSummary } from "./types";
import { refreshSessionResourceAccess } from "./resource-actions";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sessionLifecycleBadgeClass, sessionStatusLabel } from "./model";

export function SessionEditor({ session, sessions = [], blocks = [], activeWorkspace = "material", homework, canManageRecommendations = false }: {
  session: SessionSummary | null;
  sessions?: SessionSummary[];
  blocks?: SessionMaterialBlock[];
  activeWorkspace?: SessionWorkspace;
  homework?: ReactNode;
  canManageRecommendations?: boolean;
}) {
  return <HomeworkEditorProvider key={session?.id ?? "new-session"}><SessionEditorContent session={session} sessions={sessions} blocks={blocks} activeWorkspace={activeWorkspace} homework={homework} canManageRecommendations={canManageRecommendations} /></HomeworkEditorProvider>;
}

function SessionEditorContent({ session, sessions, blocks, activeWorkspace, homework, canManageRecommendations }: {
  session: SessionSummary | null;
  sessions: SessionSummary[];
  blocks: SessionMaterialBlock[];
  activeWorkspace: SessionWorkspace;
  homework?: ReactNode;
  canManageRecommendations: boolean;
}) {
  const router = useRouter();
  const homeworkEditor = useHomeworkEditorState();
  const { dirty: homeworkDirty, canCommit: homeworkCanCommit, canPublish: homeworkCanPublish } = homeworkEditor;
  const [editor, setEditor] = useState<SessionEditorState>(() => initialSessionEditorState(session, blocks));
  const [baseline, setBaseline] = useState<SessionEditorState>(() => initialSessionEditorState(session, blocks));
  const [pending, startTransition] = useTransition();
  const pendingRef = useRef(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<SessionPreviewTab>("material");
  const [publishActionError, setPublishActionError] = useState<string | null>(null);
  const [resourceAccess, setResourceAccess] = useState<Record<string, string>>({});
  const pendingDestinationRef = useRef<string | null>(null);
  const bypassDestinationRef = useRef<string | null>(null);
  const dirty = editorStateIsDirty(editor, baseline);
  const pageDirty = sessionEditorPageIsDirty(dirty, homeworkDirty);
  const archived = editor.status === "archived";
  const saveError = editor.status === "published" ? sessionPublishError(editor) : sessionSaveError(editor);
  const publishError = sessionPublishError(editor);
  const publishMessage = publishError ?? publishActionError;
  const firstSave = editor.sessionId === null;
  const currentSessionIndex = sessions.findIndex((item) => item.id === session?.id);
  const hasSessionNavigation = sessions.length > 1;

  function navigateToSession(sessionId: string) {
    if (!session) return;
    const request = sessionNavigationRequest(sessionId, session.id, activeWorkspace, pageDirty);
    if (!request.destination) return;
    if (request.requiresConfirmation) {
      pendingDestinationRef.current = request.destination;
      setDiscardOpen(true);
      return;
    }
    router.push(request.destination);
  }

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

  function updateEditor(update: (current: SessionEditorState) => SessionEditorState) {
    setPublishActionError(null);
    setEditor(update);
  }

  function updateBlocks(update: (current: StagedMaterialBlock[]) => StagedMaterialBlock[]) {
    updateEditor((current) => ({ ...current, blocks: update(current.blocks) }));
  }

  function save(intent: "save" | "publish" | "publish_changes") {
    if (pendingRef.current || archived || !homeworkCanCommit || (intent !== "save" && !homeworkCanPublish)) return;
    const validation = intent === "publish" ? publishError : intent === "publish_changes" || (!dirty && !firstSave) ? null : saveError;
    if (validation) { setPublishActionError(validation); return; }
    setPublishActionError(null);
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
        if ("error" in result) {
          if (result.errorKind === "validation") setPublishActionError(result.error);
          else showErrorToast(result.error);
          return;
        }
        const next = result.sessionState ? {
          sessionId: result.sessionState.sessionId,
          status: result.sessionState.status,
          title: result.sessionState.title,
          isFinal: result.sessionState.isFinal,
          blocks: result.sessionState.blocks,
        } satisfies SessionEditorState : null;
        if (next) { updateEditor(() => next); setBaseline(next); }
        if ((homeworkDirty || intent !== "save") && result.homework.versionId) {
          homeworkEditor.acceptPersisted(result.homework.versionId, result.homework.blocks, result.homework.status ?? "draft", result.homework.pages);
        }
        const successMessage = intent === "publish" ? "Session published successfully."
          : intent === "publish_changes" ? "Homework published successfully."
            : homeworkDirty && dirty ? "Session and Homework changes saved successfully."
              : homeworkDirty ? "Homework saved successfully."
                : firstSave ? "Session draft saved successfully." : "Session changes saved successfully.";
        showSuccessToast(successMessage);
        if (firstSave && next) router.replace(`/session-builder/${next.sessionId}`);
      } catch {
        const message = intent === "publish" ? "The Session could not be published. Please try again."
          : intent === "publish_changes" ? "Homework changes could not be published. Please try again."
            : "Changes could not be saved. Please try again.";
        showErrorToast(message);
      } finally {
        pendingRef.current = false;
      }
    });
  }

  function discardLocalChanges() {
    updateEditor(() => restoreSessionEditorState(baseline));
  }

  function openPreview(tab: SessionPreviewTab) {
    setPreviewTab(tab);
    setPreviewOpen(true);
    const ids = editor.blocks.flatMap((block) => block.blockType === "library_resource" && block.resourceId ? [block.resourceId] : []);
    if (ids.length) refreshSessionResourceAccess(ids).then(setResourceAccess)
      .catch(() => showErrorToast("Resource preview could not be loaded. Please try again."));
  }

  return <div inert={pending} aria-busy={pending}>
    {session ? <header className="mb-6 grid min-w-0 grid-cols-1 gap-y-3 sm:grid-cols-[minmax(0,1fr)_minmax(20rem,32rem)] sm:gap-x-6">
      <div className="min-w-0 sm:col-start-1 sm:row-start-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-bold text-text-primary">Edit Session</h1>
          <Badge className={sessionLifecycleBadgeClass(session.status)}>{sessionStatusLabel(session.status)}</Badge>
        </div>
      </div>
      {hasSessionNavigation ? <nav aria-label="Session navigation" className="row-start-2 flex min-w-0 items-center gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:self-center">
        <button type="button" aria-label="Previous Session" title="Previous Session" onClick={() => currentSessionIndex > 0 && navigateToSession(sessions[currentSessionIndex - 1].id)} disabled={currentSessionIndex <= 0} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-white text-text-primary transition hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45">
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
        <Select value={session.id} onValueChange={navigateToSession}>
          <SelectTrigger aria-label="Select Session" className="min-w-0 flex-1"><SelectValue>{`Session ${session.curriculumNumber}: ${session.title}`}</SelectValue></SelectTrigger>
          <SelectContent>
            {sessions.map((item) => <SelectItem key={item.id} value={item.id}>Session {item.curriculumNumber}: {item.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <button type="button" aria-label="Next Session" title="Next Session" onClick={() => currentSessionIndex >= 0 && currentSessionIndex < sessions.length - 1 && navigateToSession(sessions[currentSessionIndex + 1].id)} disabled={currentSessionIndex < 0 || currentSessionIndex >= sessions.length - 1} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-white text-text-primary transition hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45">
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </nav> : null}
      <p className={`text-sm text-text-muted sm:col-start-1 sm:row-start-2 ${hasSessionNavigation ? "row-start-3" : "row-start-2"}`}>Manage this session draft and its lifecycle.</p>
    </header> : null}
    <section className="rounded-lg border border-border bg-surface p-5 sm:p-6">
    <div className="mb-5 grid gap-3">
      <label className="grid min-w-0 flex-1 basis-64 gap-1.5 text-sm font-medium text-text-primary">Session title
        <input value={editor.title} onChange={(event) => updateEditor((current) => ({ ...current, title: event.target.value }))} autoFocus={firstSave} maxLength={180} disabled={archived} className="min-h-10 rounded-md border border-border bg-white px-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/20 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted" />
      </label>
      <div className="grid justify-items-start gap-1">
        <label className="inline-flex min-h-8 items-center gap-2 text-sm font-medium text-text-primary">
          <Checkbox checked={editor.isFinal} onCheckedChange={(checked) => updateEditor((current) => ({ ...current, isFinal: checked === true }))} disabled={archived} />
          Final Session
        </label>
        <p className="pl-6 text-xs text-text-muted">Completing this Session ends the counseling program instead of scheduling another Session.</p>
      </div>
    </div>

    <SessionPreviewProvider value={openPreview}>
      <div className="mb-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SessionWorkspaceNavigation sessionId={editor.sessionId} activeWorkspace={activeWorkspace} className="min-w-0 flex-1" />
        <button type="button" onClick={() => openPreview(sessionPreviewTabForWorkspace(activeWorkspace))} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-end rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-brand-primary hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:text-brand-primary focus-visible:outline-none sm:self-auto">
          <Eye className="size-4" aria-hidden="true" />Preview
        </button>
      </div>
      {activeWorkspace === "material" || !editor.sessionId
        ? <SessionMaterialEditor blocks={editor.blocks} archived={archived} canManageRecommendations={canManageRecommendations} updateBlocks={updateBlocks} />
        : homework}
    </SessionPreviewProvider>
    <SessionPreview open={previewOpen} onOpenChange={setPreviewOpen} tab={previewTab} onTabChange={setPreviewTab} materialBlocks={editor.blocks} homeworkBlocks={homeworkEditor.state.blocks} homeworkPages={homeworkEditor.state.pages} resourceAccess={resourceAccess} />

    <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
      {pageDirty ? <span role="status" className="mr-auto text-xs font-medium text-text-muted">Unsaved changes</span> : null}
      {firstSave ? <button type="button" onClick={() => router.push("/session-builder")} className="min-h-10 rounded-md px-3 py-2 text-sm font-semibold text-text-muted transition hover:bg-surface-muted hover:text-text-primary">Cancel</button> : <button type="button" onClick={() => { discardLocalChanges(); homeworkEditor.discard(); }} disabled={!pageDirty || pending} className="min-h-10 rounded-md px-3 py-2 text-sm font-semibold text-text-muted transition hover:bg-surface-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50">Discard Changes</button>}
      {!archived ? <>
        <button type="button" onClick={() => save("save")} disabled={pending || !homeworkCanCommit || Boolean((dirty || firstSave) && saveError) || (!firstSave && !pageDirty)} className="min-h-10 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:opacity-60">
          {pending ? "Saving..." : firstSave ? "Save Draft" : "Save Changes"}
        </button>
        {editor.status === "draft" ? <button type="button" onClick={() => save("publish")} disabled={pending || !homeworkCanCommit || !homeworkCanPublish || Boolean(publishError)} className="min-h-10 rounded-md border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary transition hover:bg-surface-muted disabled:opacity-60">Publish Session</button> : homeworkEditor.state.versionStatus === "draft" && homeworkEditor.state.baseline.length > 0 ? <button type="button" onClick={() => save("publish_changes")} disabled={pending || !homeworkCanCommit || !homeworkCanPublish} className="min-h-10 rounded-md border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary transition hover:bg-surface-muted disabled:opacity-60">Publish Changes</button> : null}
        {editor.status === "draft" && publishMessage || editor.status !== "draft" && publishActionError || !homeworkCanPublish && homeworkDirty ? <p role="status" className="basis-full text-right text-xs text-text-muted">{editor.status === "draft" ? publishMessage : publishActionError}{!homeworkCanPublish ? " Complete every Homework page title and add at least one content block per page before publishing." : null}</p> : null}
      </> : null}
    </div>

    </section>
    <AlertDialog open={discardOpen} onOpenChange={(open) => { setDiscardOpen(open); if (!open) pendingDestinationRef.current = null; }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle><AlertDialogDescription>You have changes that haven’t been saved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => { pendingDestinationRef.current = null; }}>Keep Editing</AlertDialogCancel><AlertDialogAction onClick={() => { const destination = pendingDestinationRef.current; pendingDestinationRef.current = null; setDiscardOpen(false); if (destination) { bypassDestinationRef.current = destination; router.push(destination); queueMicrotask(() => { if (bypassDestinationRef.current === destination) bypassDestinationRef.current = null; }); } }}>Discard Changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </div>;
}
