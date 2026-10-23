import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { CoupleSessionView } from "./session-view";
import type { CoupleSessionViewData } from "./queries";

vi.mock("server-only", () => ({}));
vi.mock("@/features/counseling-sessions/case-lifecycle-realtime", () => ({ CaseLifecycleRealtime: ({ caseId }: { caseId: string }) => createElement("i", { "data-lifecycle-case": caseId }) }));

const session: CoupleSessionViewData = {
  id: "case-session-1", caseId: "case-1", number: 2, title: "Testing", status: "active", caseCompleted: false, homeworkRequired: false, homework: null,
  materials: [1, 2, 3].map((number) => ({ key: `page-${number}`, persistedId: `page-${number}`, blockType: "rich_text" as const, title: `Welcome ${number}`, richTextContent: { type: "doc", content: [] }, url: "", description: "", resourceId: null, resourceVersionId: null, resourceCategory: null, resource: null })),
};

describe("Couple Session View", () => {
  it("renders released Session breadcrumbs, two tabs, and a no-Homework empty state", () => {
    const html = renderToStaticMarkup(createElement(CoupleSessionView, { session, initialTab: "homework" }));
    expect(html).toContain('data-lifecycle-case="case-1"');
    expect(html).toContain('href="/workspace">Workspace</a>');
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toMatch(/aria-current="page" class="[^"]+">Session 2<\/span>/);
    expect((html.match(/href="\/workspace"/g) ?? [])).toHaveLength(1);
    expect(html).not.toContain("ArrowLeft");
    const breadcrumb = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
    expect(breadcrumb).toContain("Workspace");
    expect(breadcrumb).toContain("Session 2");
    expect(breadcrumb).not.toContain("Sessions");
    expect(breadcrumb).not.toContain("rounded-md");
    expect(breadcrumb).not.toContain("bg-surface-muted");
    expect(html).toContain("Session Homework");
    expect(html).toContain("Testing Homework");
    expect(html).not.toContain(">Current</span>");
    expect(html).toContain("Session Material");
    expect(html).toContain("Homework");
    expect(html).toContain("No Homework for this Session");
    expect(html).toContain("There’s nothing you need to complete before your next meeting.");
    expect(html).not.toContain("Add Page");
    expect(html).not.toContain("Edit Session");
    expect(html).not.toContain("/session-builder/");
    expect(html).not.toContain("/workspace/cases/");
    const materialHtml = renderToStaticMarkup(createElement(CoupleSessionView, { session, initialTab: "material" }));
    expect(materialHtml).toContain(">Current Session</p>");
    expect(materialHtml).toContain("Session 2: Testing");
    expect(materialHtml).toContain(">Current</span>");
    expect(materialHtml).toContain("Page 1 of 3");
    expect(materialHtml).toContain('class="grid w-full gap-8"');
    expect(materialHtml).toContain("Previous Page");
    expect(materialHtml).toContain("Next Page");
    const tabRow = materialHtml.slice(materialHtml.indexOf('class="flex w-full flex-wrap items-center justify-between gap-3"'), materialHtml.indexOf('role="tabpanel"'));
    expect(tabRow).toContain('aria-label="Session sections"');
    expect(tabRow).toContain("w-full sm:w-auto");
    expect(tabRow).toContain("ml-auto text-sm font-medium text-text-muted");
    expect(tabRow.indexOf("Session Material")).toBeLessThan(tabRow.indexOf("Page 1 of 3"));
    expect(materialHtml.match(/Page 1 of 3/g)).toHaveLength(1);
    expect(materialHtml).toContain("flex-wrap items-center justify-between gap-3");
    expect(materialHtml).not.toContain("px-4 py-5");
    expect(materialHtml).not.toContain("max-w-3xl");
    const materialBreadcrumb = materialHtml.slice(materialHtml.indexOf("<nav"), materialHtml.indexOf("</nav>"));
    expect(materialBreadcrumb).toBe(breadcrumb);
    const homeworkHtml = renderToStaticMarkup(createElement(CoupleSessionView, { session, initialTab: "homework" }));
    expect(homeworkHtml).toContain("No Homework for this Session");
    expect(homeworkHtml).toContain("There’s nothing you need to complete before your next meeting.");
    expect(homeworkHtml).toContain("Session Homework");
    expect(homeworkHtml).toContain("Testing Homework");
    expect(homeworkHtml).not.toContain(">Current</span>");
    expect(homeworkHtml).not.toContain("Page 1 of 3");
    expect(homeworkHtml).not.toContain("mx-auto max-w-3xl");
    expect(homeworkHtml.match(/Session Homework/g)).toHaveLength(1);
    expect(homeworkHtml.match(/Testing Homework/g)).toHaveLength(1);
  });

  it("adds a Sessions breadcrumb only for completed historical Sessions and uses the pinned authored number", () => {
    const completedSession = { ...session, number: 1, caseCompleted: true };
    const material = renderToStaticMarkup(createElement(CoupleSessionView, { session: completedSession, initialTab: "material" }));
    const homework = renderToStaticMarkup(createElement(CoupleSessionView, { session: { ...completedSession, number: 2 }, initialTab: "homework" }));
    for (const html of [material, homework]) {
      const breadcrumb = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
      expect(breadcrumb).toContain('href="/workspace">Workspace</a>');
      expect(breadcrumb).toContain('href="/workspace/sessions">Sessions</a>');
      expect(breadcrumb).toMatch(/aria-current="page" class="[^"]+">Session [12]<\/span>/);
      expect(breadcrumb.indexOf("Workspace")).toBeLessThan(breadcrumb.indexOf("Sessions"));
      expect(breadcrumb.indexOf("Sessions")).toBeLessThan(breadcrumb.indexOf("Session "));
      expect(breadcrumb.match(/href="\/workspace\/sessions"/g)).toHaveLength(1);
    }
    expect(material.slice(material.indexOf("<nav"), material.indexOf("</nav>"))).toContain(">Session 1</span>");
    expect(homework.slice(homework.indexOf("<nav"), homework.indexOf("</nav>"))).toContain(">Session 2</span>");
  });

  it("keeps active Couple Session breadcrumbs at Workspace / Session N", () => {
    const html = renderToStaticMarkup(createElement(CoupleSessionView, { session, initialTab: "homework" }));
    const breadcrumb = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
    expect(breadcrumb).toContain('href="/workspace">Workspace</a>');
    expect(breadcrumb).toContain(">Session 2</span>");
    expect(breadcrumb).not.toContain("Sessions");
  });

  it.each([
    ["not_started", "Not Started", "bg-surface-muted text-text-muted"],
    ["in_progress", "In Progress", "bg-info-soft text-info-strong"],
    ["submitted", "Submitted", "bg-success-soft text-success-strong"],
    ["reviewed", "Reviewed", "bg-success-soft text-success-strong"],
  ] as const)("shows only the signed-in partner's %s Homework status with its approved badge treatment", (status, label, badgeClasses) => {
    const assignedSession = {
      ...session,
      status: "completed" as const,
      homeworkRequired: true,
      homework: { title: "Testing Homework", status, progressId: "own-progress", blocks: [] },
    };
    const html = renderToStaticMarkup(createElement(CoupleSessionView, { session: assignedSession, initialTab: "homework" }));
    expect(html).toContain(">Session Homework</p>");
    expect(html).toContain(`${badgeClasses}">${label}</span>`);
    expect(html).not.toContain("Status:");
    expect(html.match(/Testing Homework/g)).toHaveLength(1);
    expect(html).not.toContain("Page 1 of 3");
  });

  it("keeps completed Session Homework read-only while preserving submitted answers", () => {
    const completedSession = {
      ...session,
      status: "completed" as const,
      homeworkRequired: true,
      homework: { title: "Testing Homework", status: "submitted" as const, progressId: "own-progress", blocks: [
        { id: "answer", type: "long_answer", title: null, content: { type: "doc", content: [] }, url: null, description: null, answer: "My submitted answer" },
      ] },
    };
    const html = renderToStaticMarkup(createElement(CoupleSessionView, { session: completedSession, initialTab: "homework" }));
    expect(html).toContain("My submitted answer");
    expect(html).toContain("Submitted Homework is read-only.");
    expect(html).not.toContain("Save Draft");
    expect(html).not.toContain("Submit Homework");
    expect(html).toContain("Session Material");
    expect(html).toContain("Homework");
  });

  it("bounds Session and Resource reads to the Couple's released case-session snapshot", () => {
    const queries = readFileSync("features/couple-workspace/queries.ts", "utf8");
    expect(queries).toContain('rpc("get_current_couple_case_team")');
    expect(queries).toContain('.eq("id", caseSessionId).eq("counseling_case_id", team.counseling_case_id)');
    expect(queries).toContain('case_session_material_blocks(*)');
    expect(queries).toContain('eq("id", versionId).maybeSingle()');
    expect(queries).toContain('signedResourceAccess(resourceId, { versionId })');
    const resourceServer = readFileSync("features/resource-library/server.ts", "utf8");
    expect(resourceServer).toContain('eq("resource_version_id", versionId)');
    expect(queries).not.toContain('from("sessions").select');
  });

  it("uses the Couple Workspace outer width and responsive page padding", () => {
    const viewSource = readFileSync("features/couple-workspace/session-view.tsx", "utf8");
    const workspaceSource = readFileSync("features/couple-workspace/workspace.tsx", "utf8");
    expect(viewSource).toContain('className="mx-auto max-w-[1100px] p-5 sm:p-8 lg:p-10"');
    expect(workspaceSource).toContain('className="mx-auto max-w-[1100px] p-5 sm:p-8 lg:p-10"');
    expect(viewSource).not.toContain("max-w-5xl");
    expect(viewSource).not.toContain("max-w-3xl");
    expect(viewSource).not.toContain("lg:grid-cols-");
    expect(viewSource).toContain('<TabsContent value="material" forceMount>');
  });

  it("keeps participant route authorization and the legacy Homework route on the shared component/actions", () => {
    const route = readFileSync("app/workspace/sessions/[caseSessionId]/page.tsx", "utf8");
    const homeworkRoute = readFileSync("app/workspace/homework/page.tsx", "utf8");
    const participant = readFileSync("features/couple-workspace/homework-participant.tsx", "utf8");
    const sessionView = readFileSync("features/couple-workspace/session-view.tsx", "utf8");
    const actions = readFileSync("features/couple-workspace/homework-participant-actions.ts", "utf8");
    expect(route).toContain('identity.roles.includes("couple")');
    expect(route).toContain("getCoupleSessionViewData(identity.id, caseSessionId)");
    expect(homeworkRoute).toContain("HomeworkParticipantPage homework={homework}");
    expect(participant).toContain("persistParticipantHomework");
    expect(participant).toContain("Save Draft");
    expect(participant).toContain("Submit Homework");
    expect(sessionView).toContain("onDirtyChange={setHomeworkDirty}");
    expect(actions).toContain('revalidatePath("/workspace/sessions/[caseSessionId]", "page")');
    expect(actions).toContain('revalidatePath("/workspace/homework")');
  });

  it("loads Homework response rows only for the signed-in partner and preserves pinned-version actions", () => {
    const queries = readFileSync("features/couple-workspace/queries.ts", "utf8");
    expect(queries).toContain('.eq("assignment_revision_id", revision.id).eq("profile_id", authenticatedProfileId)');
    expect(queries).toContain('.eq("participant_progress_id", progress.id)');
    expect(queries).toContain('homework_version_id", revision.homework_version_id');
  });
});
