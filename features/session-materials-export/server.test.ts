import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), supabase: vi.fn(), coupleCaseId: "case-1" }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getAuthenticatedIdentity: mocks.identity }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.supabase }));

import { getAuthorizedSessionMaterials } from "./server";

const session = { id: "case-session-1", counseling_case_id: "case-1", title: "Connection", status: "completed" };
const blocks = [{ id: "pinned-block", position: 2, block_type: "rich_text", title: "Selected page", rich_text_content: { type: "doc", content: [] }, url: null, description: null, resource_id: null, resource_version_id: null, resource_category: null }];

function makeClient(blockRows: unknown[] = blocks, resourceData: Record<string, unknown> = {}) {
  const tables: string[] = [];
  const queries = new Map<string, unknown>([
    ["case_sessions", session],
    ["case_session_material_blocks", blockRows],
    ["case_assignments", [{ assignment_type: "counselor", assigned_group_id: "team-1", assigned_profile_id: null, ended_at: null, assigned_group: { id: "team-1", group_type: "counselor_team", active: true, group_members: [{ profile_id: "counselor-1", ended_at: null }] } }]],
    ...Object.entries(resourceData),
  ]);
  const client = {
    from: vi.fn((table: string) => {
      tables.push(table);
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "is", "order"]) chain[method] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({ data: queries.get(table), error: null }));
      chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({ data: queries.get(table), error: null }).then(resolve, reject);
      return chain;
    }),
    rpc: vi.fn(async () => ({ data: [{ counseling_case_id: mocks.coupleCaseId }], error: null })),
    storage: { from: vi.fn() },
  };
  mocks.supabase.mockResolvedValue(client);
  return { client, tables };
}

describe("authorized Session snapshot export reads", () => {
  beforeEach(() => {
    mocks.coupleCaseId = "case-1";
    mocks.identity.mockResolvedValue({ id: "partner-a", accountStage: "active", roles: ["couple"] });
  });

  it("loads only the requested active/completed Case Session and immutable assigned snapshot", async () => {
    const { client, tables } = makeClient();
    const result = await getAuthorizedSessionMaterials("case-session-1");
    expect(result?.title).toBe("Connection");
    expect(result?.blocks.map(({ id }) => id)).toEqual(["pinned-block"]);
    expect(client.from.mock.calls[0][0]).toBe("case_sessions");
    expect(tables).toEqual(["case_sessions", "case_session_material_blocks"]);
    expect(client.from).not.toHaveBeenCalledWith("session_material_blocks");
    expect(client.from.mock.calls[0][0]).not.toBe("homework_participant_progress");
  });

  it("rejects another Couple's Case before reading any assigned material", async () => {
    mocks.coupleCaseId = "other-case";
    const { client, tables } = makeClient();
    expect(await getAuthorizedSessionMaterials("case-session-1")).toBeNull();
    expect(tables).toEqual(["case_sessions", "case_assignments"]);
    expect(client.from).not.toHaveBeenCalledWith("case_session_material_blocks");
  });

  it("allows only the active member of the assigned Counselor team to read the snapshot", async () => {
    mocks.identity.mockResolvedValueOnce({ id: "counselor-1", accountStage: "active", roles: ["counselor"] });
    const { tables } = makeClient();
    expect(await getAuthorizedSessionMaterials("case-session-1")).not.toBeNull();
    expect(tables).toEqual(["case_sessions", "case_assignments", "case_session_material_blocks"]);

    mocks.identity.mockResolvedValueOnce({ id: "other-counselor", accountStage: "active", roles: ["counselor"] });
    const unauthorized = makeClient();
    expect(await getAuthorizedSessionMaterials("case-session-1")).toBeNull();
    expect(unauthorized.tables).toEqual(["case_sessions", "case_assignments"]);
  });

  it("loads Resource metadata and its exact pinned version only for Resources in the authorized snapshot", async () => {
    const selectedResource = { ...blocks[0], id: "resource-block", position: 1, block_type: "library_resource", title: null, description: null, resource_id: "resource-1", resource_version_id: "pinned-version", resource_category: "document", rich_text_content: null };
    const { tables } = makeClient([selectedResource], {
      resources: { title: "Pinned reading", description: "Read this together" },
      resource_versions: { storage_path: "resource-1/pinned-version/file.pdf", mime_type: "application/pdf", size_bytes: 42 },
    });
    const result = await getAuthorizedSessionMaterials("case-session-1");
    expect(result?.blocks[0]).toMatchObject({ title: "Pinned reading", description: "Read this together", resourceId: "resource-1", resourceVersionId: "pinned-version" });
    expect(tables).toEqual(["case_sessions", "case_session_material_blocks", "resources", "resource_versions"]);
  });
});
