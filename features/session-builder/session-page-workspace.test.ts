import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement, ReactNode } from "react";

const { getSession, getSessionMaterialBlocks } = vi.hoisted(() => ({ getSession: vi.fn(), getSessionMaterialBlocks: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
vi.mock("@/features/session-builder/access", () => ({ requireSessionBuilderAccess: vi.fn(async () => ({ workspace: "author", identity: { roles: ["author"] } })) }));
vi.mock("@/features/session-builder/queries", () => ({ getSession, getSessionMaterialBlocks }));
vi.mock("@/components/navigation/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/features/session-builder/session-editor", () => ({ SessionEditor: () => null }));
vi.mock("@/features/homework/homework-builder", () => ({ HomeworkBuilder: () => null }));

import SessionDetailPage from "@/app/session-builder/[sessionId]/page";
import NewSessionPage from "@/app/session-builder/new/page";
import { SessionEditor } from "./session-editor";

function findEditor(node: ReactNode): ReactElement<{ homework?: ReactNode }> | null {
  if (!node || typeof node !== "object" || !("type" in node)) return null;
  const element = node as ReactElement<{ children?: ReactNode; homework?: ReactNode }>;
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
    getSession.mockResolvedValue({ id: "session-id", title: "Session", status: "draft", sequenceNumber: 1, curriculumNumber: 1 });
    getSessionMaterialBlocks.mockResolvedValue([]);
    const page = await SessionDetailPage({ params: Promise.resolve({ sessionId: "session-id" }), searchParams: Promise.resolve({}) });
    expect(findEditor(page)?.props.homework).toBeUndefined();
    expect(getSessionMaterialBlocks).toHaveBeenCalledWith("session-id");
    const markup = renderToStaticMarkup(page as ReactElement);
    expect(markup).toContain('aria-label="Breadcrumb"');
    expect(markup).toContain("Session Builder");
    expect(markup).toContain("Session 1");
    expect(markup).toContain("Edit Session");
    expect(markup).toContain("Draft");
    expect(markup).toContain("bg-amber-100");
    expect(markup).not.toContain("tracking-widest text-brand-secondary");
  });

  it("constructs Homework only for the selected saved-Session workspace", async () => {
    const page = await SessionDetailPage({ params: Promise.resolve({ sessionId: "session-id" }), searchParams: Promise.resolve({ workspace: "homework" }) });
    expect(findEditor(page)?.props.homework).toBeDefined();
  });

  it("places Published beside the page title with the positive lifecycle treatment", async () => {
    getSession.mockResolvedValue({ id: "session-id", title: "Session", status: "published", sequenceNumber: 1, curriculumNumber: 1 });
    getSessionMaterialBlocks.mockResolvedValue([]);
    const page = await SessionDetailPage({ params: Promise.resolve({ sessionId: "session-id" }), searchParams: Promise.resolve({}) });
    const markup = renderToStaticMarkup(page as ReactElement);
    expect(markup).toContain("Published");
    expect(markup).toContain("bg-green-100");
  });

  it("renders the new Session breadcrumb and unified builder copy above the editor", async () => {
    const page = await NewSessionPage();
    const markup = renderToStaticMarkup(page as ReactElement);
    expect(markup).toContain('aria-label="Breadcrumb"');
    expect(markup).toContain("Create a Session");
    expect(markup).toContain("Build the session material and save when you&#x27;re ready.");
  });
});
