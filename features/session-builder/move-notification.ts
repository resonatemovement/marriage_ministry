import type { SessionSummary } from "./types";
import type { MoveContentInput } from "./move-content-actions";

export function homeworkPageMoveFeedback(itemLabel: string, sourcePage: { position: number; title: string }, destinationPage: { position: number; title: string }) {
  const source = pageLabel(sourcePage.position, sourcePage.title);
  const destination = pageLabel(destinationPage.position, destinationPage.title);
  return {
    title: `Content moved to ${destination}`,
    description: `“${itemLabel}” moved from ${source} to ${destination}. This draft change is not saved yet; choose Save Draft to persist it.`,
  };
}

export function sessionMoveFeedback(kind: MoveContentInput["kind"], itemLabel: string, source: SessionSummary, destination: SessionSummary) {
  const homework = kind === "homework_page";
  const item = homework ? `${itemLabel} and all its content` : itemLabel;
  return {
    title: homework ? "Homework page moved successfully" : "Session Material moved successfully",
    description: `“${item}” moved from ${sessionLabel(source)} to ${sessionLabel(destination)}.`,
    destinationHref: sessionBuilderHref(destination.id, kind),
  };
}

export function sessionBuilderHref(sessionId: string, kind: MoveContentInput["kind"]) {
  const workspace = kind.startsWith("homework") ? "homework" : "material";
  return `/session-builder/${sessionId}?workspace=${workspace}`;
}

function pageLabel(position: number, title: string) {
  return `Page ${position + 1}${title.trim() ? `: ${title.trim()}` : ""}`;
}

function sessionLabel(session: SessionSummary) {
  return `Session ${session.curriculumNumber}: ${session.title}`;
}
