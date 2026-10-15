import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ team: [{ counseling_case_id: "couple-case" }], session: null as Record<string, unknown> | null, results: { counseling_cases: { status: "active", closed_at: null } } as Record<string, unknown>, queries: [] as Array<{ table: string; filters: Array<[string, unknown]> }> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({
  rpc: vi.fn(async () => ({ data: mock.team, error: null })),
  from: vi.fn((table: string) => {
    const query = { table, filters: [] as Array<[string, unknown]> };
    mock.queries.push(query);
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((key: string, value: unknown) => { query.filters.push([key, value]); return builder; }),
      in: vi.fn((key: string, value: unknown) => { query.filters.push([key, value]); return builder; }),
      order: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "case_sessions" ? mock.session : mock.results[table] ?? null, error: null }).then(resolve),
    };
    return builder;
  }),
  storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "pinned-url" }, error: null }) }) },
}) }));
vi.mock("@/features/resource-library/server", () => ({ signedResourceAccess: vi.fn(async () => ({ signedUrl: "pinned-url" })) }));
vi.mock("@/lib/storage/profile-photo", () => ({ getProfilePhotoUrl: vi.fn() }));
vi.mock("@/features/counseling-contacts/queries", () => ({ getCurrentCoupleCounselor: vi.fn() }));

import { getCoupleSessionViewData } from "./queries";

describe("Couple Session view data boundary", () => {
  beforeEach(() => {
    mock.team = [{ counseling_case_id: "couple-case" }];
    mock.session = { id: "case-session-1", counseling_case_id: "couple-case", session_id: "builder-session", actual_sequence: 1, template_sequence_number: 2, title: "Pinned title", status: "active", homework_assignment_revision_id: null, case_session_material_blocks: [{ id: "page-1", position: 0, block_type: "rich_text", title: "Released page", rich_text_content: { type: "doc", content: [] } }] };
    mock.results = { counseling_cases: { status: "active", closed_at: null } };
    mock.queries = [];
  });

  it("loads only a released snapshot belonging to the signed-in Couple's case", async () => {
    const result = await getCoupleSessionViewData("partner-a", "case-session-1");
    expect(result).toMatchObject({ id: "case-session-1", number: 2, title: "Pinned title", caseCompleted: false, homeworkRequired: false, materials: [{ title: "Released page" }] });
    expect(mock.queries[0]).toMatchObject({ table: "case_sessions", filters: [["id", "case-session-1"], ["counseling_case_id", "couple-case"], ["status", ["active", "completed"]]] });
  });

  it("uses the completed case state only to enable its legitimate Sessions breadcrumb", async () => {
    mock.results.counseling_cases = { status: "finished", closed_at: "2026-10-15T22:13:44Z" };
    const completed = await getCoupleSessionViewData("partner-a", "case-session-1");
    expect(completed?.caseCompleted).toBe(true);
    mock.results.counseling_cases = { status: "inactive", closed_at: "2026-10-15T22:13:44Z" };
    const closedIncomplete = await getCoupleSessionViewData("partner-a", "case-session-1");
    expect(closedIncomplete?.caseCompleted).toBe(false);
  });

  it("rejects a Session instance outside the Couple's case", async () => {
    mock.session = null;
    await expect(getCoupleSessionViewData("partner-a", "other-case-session")).resolves.toBeNull();
    expect(mock.queries[0].filters).toContainEqual(["id", "other-case-session"]);
    expect(mock.queries[0].filters).toContainEqual(["counseling_case_id", "couple-case"]);
  });

  it("loads only the signed-in partner's answers from the pinned Homework revision", async () => {
    mock.session = { ...mock.session, homework_assignment_revision_id: "pinned-revision" };
    mock.results.homework_assignment_revisions = { id: "pinned-revision", homework_version_id: "pinned-homework-version" };
    mock.results.homework_participant_progress = { id: "own-progress", status: "in_progress" };
    mock.results.homework_version_blocks = [{ id: "answer-block", position: 0, block_type: "long_answer", title: "Your answer", rich_text_content: { type: "doc", content: [] } }];
    mock.results.homework_answers = [{ homework_version_block_id: "answer-block", answer_text: "Private answer" }];
    const result = await getCoupleSessionViewData("partner-a", "case-session-1");
    expect(result?.homework).toMatchObject({ status: "in_progress", progressId: "own-progress", blocks: [{ answer: "Private answer" }] });
    expect(mock.queries.find(({ table }) => table === "homework_participant_progress")?.filters).toContainEqual(["profile_id", "partner-a"]);
    expect(mock.queries.find(({ table }) => table === "homework_answers")?.filters).toContainEqual(["participant_progress_id", "own-progress"]);
  });

  it("loads resource metadata and signed access from the snapshot's pinned version", async () => {
    mock.session = { ...mock.session, case_session_material_blocks: [{ id: "resource-block", position: 0, block_type: "library_resource", title: "Released resource title", description: "Released description", resource_id: "resource-1", resource_version_id: "pinned-version", resource_category: "document" }] };
    mock.results.resource_versions = { id: "pinned-version", original_filename: "release.pdf", mime_type: "application/pdf", size_bytes: 44, created_at: "2026-01-01T00:00:00Z" };
    const result = await getCoupleSessionViewData("partner-a", "case-session-1");
    expect(result?.materials[0].resource).toMatchObject({ title: "Released resource title", description: "Released description", currentVersion: { originalFilename: "release.pdf" }, previewUrl: "pinned-url" });
    expect(mock.queries.find(({ table }) => table === "resource_versions")?.filters).toEqual([["resource_id", "resource-1"], ["id", "pinned-version"]]);
  });
});
