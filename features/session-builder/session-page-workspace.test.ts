import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement, ReactNode } from "react";

const { getSession, getSessionMaterialBlocks, getSessions } = vi.hoisted(() => ({ getSession: vi.fn(), getSessionMaterialBlocks: vi.fn(), getSessions: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
vi.mock("@/features/session-builder/access", () => ({ requireSessionBuilderAccess: vi.fn(async () => ({ workspace: "author", identity: { roles: ["author"] } })) }));
vi.mock("@/features/session-builder/queries", () => ({ getSession, getSessionMaterialBlocks, getSessions }));
vi.mock("@/components/navigation/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/features/session-builder/session-editor", () => ({ SessionEditor: () => null }));
vi.mock("@/features/homework/homework-builder", () => ({ HomeworkBuilder: () => null }));

import SessionDetailPage from "@/app/session-builder/[sessionId]/page";
import NewSessionPage from "@/app/session-builder/new/page";
import { SessionEditor } from "./session-editor";

function findEditor(node: ReactNode): ReactElement<{ homework?: ReactNode; sessions?: unknown }> | null {
  if (!node || typeof node !== "object" || !("type" in node)) return null;
  const element = node as ReactElement<{ children?: ReactNode; homework?: ReactNode; sessions?: unknown }>;
  if (element.type === SessionEditor) return element;
  const children = element.props.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findEditor(child);
    if (found) return found;
  }
  return null;
}

describe("saved Session workspace wiring", () => {
  it("keeps Material as default without constructing the Homework server component", async () => {
    getSession.mockResolvedValue({ id: "session-id", title: "Session", status: "draft", isFinal: false, sequenceNumber: 1, curriculumNumber: 1 });
    getSessionMaterialBlocks.mockResolvedValue([]);
    getSessions.mockResolvedValue([{ id: "session-id", title: "Session", status: "draft", isFinal: false, sequenceNumber: 1, curriculumNumber: 1 }]);
    const page = await SessionDetailPage({ params: Promise.resolve({ sessionId: "session-id" }), searchParams: Promise.resolve({}) });
    expect(findEditor(page)?.props.homework).toBeUndefined();
    expect(getSessionMaterialBlocks).toHaveBeenCalledWith("session-id");
    const markup = renderToStaticMarkup(page as ReactElement);
    expect(markup).toContain('aria-label="Breadcrumb"');
    expect(markup).toContain("Session Builder");
    expect(markup).toContain("Session 1");
    expect(markup).not.toContain("tracking-widest text-brand-secondary");
    expect(getSessions).toHaveBeenCalledTimes(1);
  });

  it("constructs Homework only for the selected saved-Session workspace", async () => {
    getSession.mockResolvedValue({ id: "session-id", title: "Session", status: "draft", isFinal: false, sequenceNumber: 1, curriculumNumber: 1 });
    getSessionMaterialBlocks.mockResolvedValue([]);
    getSessions.mockResolvedValue([{ id: "session-id", title: "Session", status: "draft", isFinal: false, sequenceNumber: 1, curriculumNumber: 1 }]);
    const page = await SessionDetailPage({ params: Promise.resolve({ sessionId: "session-id" }), searchParams: Promise.resolve({ workspace: "homework" }) });
    const homework = findEditor(page)?.props.homework as ReactElement | undefined;
    expect(homework).toBeDefined();
    expect(homework?.key).toBe("homework-session-id");
  });

  it("provides all existing Sessions to the editor in the query's established order", async () => {
    getSession.mockResolvedValue({ id: "session-id", title: "Session", status: "published", isFinal: false, sequenceNumber: 1, curriculumNumber: 1 });
    getSessionMaterialBlocks.mockResolvedValue([]);
    const sessions = [
      { id: "session-1", title: "First", status: "draft", isFinal: false, sequenceNumber: 1, curriculumNumber: 1 },
      { id: "session-id", title: "Current", status: "published", isFinal: false, sequenceNumber: 2, curriculumNumber: 2 },
      { id: "session-3", title: "Archived", status: "archived", isFinal: false, sequenceNumber: 3, curriculumNumber: 3 },
    ];
    getSessions.mockResolvedValue(sessions);
    const page = await SessionDetailPage({ params: Promise.resolve({ sessionId: "session-id" }), searchParams: Promise.resolve({}) });
    expect(findEditor(page)?.props.sessions).toEqual(sessions.slice(0, 2));
  });

  it("does not query or expose navigation choices for an inaccessible or nonexistent Session", async () => {
    getSessions.mockClear();
    getSession.mockResolvedValue(null);
    await expect(SessionDetailPage({ params: Promise.resolve({ sessionId: "unavailable" }), searchParams: Promise.resolve({}) })).rejects.toThrow("not found");
    expect(getSessions).not.toHaveBeenCalled();
  });

  it("renders the new Session breadcrumb and unified builder copy above the editor", async () => {
    const page = await NewSessionPage();
    const markup = renderToStaticMarkup(page as ReactElement);
    expect(markup).toContain('aria-label="Breadcrumb"');
    expect(markup).toContain("Create a Session");
    expect(markup).toContain("Build the session material and save when you&#x27;re ready.");
  });
});
