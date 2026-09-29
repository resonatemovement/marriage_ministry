import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { message: string } | null; count?: number };
const mock = vi.hoisted(() => ({ identity: vi.fn(), claims: vi.fn(), clientRpc: vi.fn(), serviceRpc: vi.fn(),
  from: vi.fn(), serviceFrom: vi.fn(), signedView: vi.fn(), signedUpload: vi.fn(), remove: vi.fn(),
  storageFrom: vi.fn(), serviceStorageFrom: vi.fn(), serviceClient: vi.fn(), results: [] as Result[], builders: [] as ReturnType<typeof builder>[] }));

function builder() {
  return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
    then: (resolve: (result: Result) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(mock.results.shift() ?? { data: [], error: null }).then(resolve, reject) };
}
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getAuthenticatedIdentity: mock.identity }));
vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnvironment: () => ({ url: "https://lctkqjjkhpyootwvttvj.supabase.co" }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({
  auth: { getClaims: mock.claims }, rpc: mock.clientRpc, from: mock.from, storage: { from: mock.storageFrom },
}) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mock.serviceClient }));

import { archiveResource, browseResources, editResourceMetadata, finalizeUpload, getResourceDetail, permanentlyDeleteResource, prepareUpload, retryResourceCleanup, signedResourceAccess } from "./server";

describe("Resource server boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mock.results.length = 0; mock.builders.length = 0;
    vi.stubEnv("SUPABASE_SECRET_KEY", "server-test-secret");
    mock.identity.mockResolvedValue({ roles: ["admin"], accountStage: "active" });
    mock.claims.mockResolvedValue({ data: { claims: { sub: "owner" } } });
    mock.clientRpc.mockResolvedValue({ data: null, error: null });
    mock.serviceRpc.mockResolvedValue({ data: 0, error: null });
    const makeBuilder = () => { const query = builder(); mock.builders.push(query); return query; };
    mock.from.mockImplementation(makeBuilder); mock.serviceFrom.mockImplementation(makeBuilder);
    mock.storageFrom.mockReturnValue({ createSignedUrl: mock.signedView });
    mock.serviceStorageFrom.mockReturnValue({ createSignedUploadUrl: mock.signedUpload, remove: mock.remove });
    mock.serviceClient.mockReturnValue({ rpc: mock.serviceRpc, from: mock.serviceFrom, storage: { from: mock.serviceStorageFrom } });
    mock.signedView.mockResolvedValue({ data: { signedUrl: "private-view" }, error: null });
    mock.signedUpload.mockResolvedValue({ data: { token: "upload-token", signedUrl: "direct-storage", path: "resource/version/file.pdf" }, error: null });
    mock.remove.mockResolvedValue({ data: [], error: null });
  });

  it("rejects unauthenticated, inactive, and non-authoring actors before data access", async () => {
    for (const identity of [null, { roles: ["admin"], accountStage: "onboarding" }, { roles: ["coach"], accountStage: "active" }]) {
      mock.identity.mockResolvedValue(identity);
      await expect(browseResources()).rejects.toThrow("Not authorized");
    }
    expect(mock.from).not.toHaveBeenCalled(); expect(mock.serviceClient).not.toHaveBeenCalled();
  });
  it("browses paginated active metadata/current versions using the authenticated RLS client", async () => {
    mock.results.push({ data: [{ id: "resource" }], error: null, count: 1 });
    expect(await browseResources({ category: "document", search: "100%_", offset: 50 })).toEqual({ resources: [{ id: "resource" }], count: 1 });
    expect(mock.builders[0].is).toHaveBeenCalledWith("archived_at", null);
    expect(mock.builders[0].eq).toHaveBeenCalledWith("category", "document");
    expect(mock.builders[0].ilike).toHaveBeenCalledWith("title", "%100\\%\\_%");
    expect(mock.builders[0].range).toHaveBeenCalledWith(50, 99);
    expect(mock.serviceClient).not.toHaveBeenCalled();
  });
  it("loads resource details and ordered immutable versions", async () => {
    mock.results.push({ data: { id: "resource" }, error: null }, { data: [{ id: "version" }], error: null });
    expect(await getResourceDetail("resource")).toEqual({ resource: { id: "resource" }, versions: [{ id: "version" }] });
    expect(mock.builders[1].eq).toHaveBeenCalledWith("resource_id", "resource");
    expect(mock.builders[1].order).toHaveBeenCalledWith("version_number", { ascending: false });
  });
  it("only signs an RLS-readable version belonging to the requested resource", async () => {
    mock.results.push({ data: { current_version_id: "current" }, error: null },
      { data: { storage_path: "resource/pinned/file.pdf", original_filename: "Original.pdf" }, error: null });
    expect(await signedResourceAccess("resource", { versionId: "pinned", download: true })).toEqual({ signedUrl: "private-view" });
    expect(mock.builders[1].eq).toHaveBeenCalledWith("resource_id", "resource");
    expect(mock.builders[1].eq).toHaveBeenCalledWith("id", "pinned");
    expect(mock.signedView).toHaveBeenCalledWith("resource/pinned/file.pdf", 300, { download: "Original.pdf" });
    expect(mock.serviceClient).not.toHaveBeenCalled();
  });
  it("never uses privileged Storage signing to bypass an RLS denial", async () => {
    mock.results.push({ data: null, error: { message: "Resource unavailable" } });
    await expect(signedResourceAccess("hidden")).rejects.toThrow("Resource unavailable");
    expect(mock.signedView).not.toHaveBeenCalled(); expect(mock.serviceClient).not.toHaveBeenCalled();
  });
  it("validates metadata before the authoritative DB authorization RPC", async () => {
    await expect(editResourceMetadata("resource", { title: " " })).rejects.toThrow("Invalid");
    expect(mock.clientRpc).not.toHaveBeenCalled();
    mock.clientRpc.mockResolvedValue({ data: null, error: { message: "Not authorized" } });
    await expect(editResourceMetadata("resource", { title: " Valid " })).rejects.toThrow("Not authorized");
    expect(mock.clientRpc).toHaveBeenCalledWith("update_resource_metadata", { target_resource_id: "resource", target_title: "Valid", target_description: "" });
  });
  it("signs only a freshly authorized exact path with overwrite disabled", async () => {
    mock.clientRpc.mockResolvedValue({ data: { id: "version", resource_id: "resource", mime_type: "application/pdf", size_bytes: 10,
      storage_path: "resource/version/file.pdf", created_at: new Date().toISOString() }, error: null });
    const result = await prepareUpload({ title: "Title", category: "document", mimeType: "application/pdf", sizeBytes: 10, originalFilename: "file.pdf" });
    expect(result).toMatchObject({ resourceId: "resource", uploadId: "version", token: "upload-token" });
    expect(mock.signedUpload).toHaveBeenCalledWith("resource/version/file.pdf", { upsert: false });
    expect(mock.serviceStorageFrom).toHaveBeenCalledWith("resource-library");
    expect(mock.clientRpc.mock.calls[0][1]).toMatchObject({ target_resource_id: null, target_mime_type: "application/pdf", target_size_bytes: 10 });
  });
  it("cancels a stale reservation without issuing a longer-lived token", async () => {
    mock.clientRpc.mockResolvedValueOnce({ data: { id: "version", created_at: "2000-01-01T00:00:00Z" }, error: null });
    await expect(prepareUpload({ title: "Title", category: "document", mimeType: "application/pdf", sizeBytes: 10, originalFilename: "file.pdf" })).rejects.toThrow("signing window expired");
    expect(mock.signedUpload).not.toHaveBeenCalled();
    expect(mock.clientRpc).toHaveBeenCalledWith("cancel_resource_upload", { target_upload_id: "version" });
  });
  it("denies Author archive and permanent deletion server-side", async () => {
    mock.identity.mockResolvedValue({ roles: ["author"], accountStage: "active" });
    await expect(archiveResource("resource", true)).rejects.toThrow("Not authorized");
    await expect(permanentlyDeleteResource("resource", "DELETE")).rejects.toThrow("Not authorized");
    expect(mock.clientRpc).not.toHaveBeenCalled();
  });
  it("passes centralized retention only to service pruning after DB finalization", async () => {
    mock.clientRpc.mockResolvedValue({ data: { id: "new-version", resource_id: "resource", version_number: 5 }, error: null });
    mock.serviceRpc.mockResolvedValue({ data: 1, error: null });
    mock.results.push({ data: [], error: null }, { data: null, error: null, count: 0 });
    expect(await finalizeUpload("new-version")).toMatchObject({ version: { id: "new-version", version_number: 5 }, maintenance: { pruned: 1, errors: [] } });
    expect(mock.serviceRpc).toHaveBeenCalledWith("prune_resource_versions", { target_resource_id: "resource", keep_previous: 3 });
    expect(mock.clientRpc.mock.invocationCallOrder[0]).toBeLessThan(mock.serviceRpc.mock.invocationCallOrder[0]);
  });
  it("requires exact uppercase DELETE and never removes files after rejected DB deletion", async () => {
    await expect(permanentlyDeleteResource("resource", "delete")).rejects.toThrow("DELETE");
    mock.clientRpc.mockResolvedValue({ data: null, error: { message: "Protected foreign key" } });
    await expect(permanentlyDeleteResource("resource", "DELETE")).rejects.toThrow("Protected foreign key");
    expect(mock.remove).not.toHaveBeenCalled(); expect(mock.serviceClient).not.toHaveBeenCalled();
  });
  it("reports and persists Storage cleanup failures for retry after successful DB deletion", async () => {
    mock.results.push({ data: [{ storage_path: "old/path", resource_id: "resource", attempts: 2 }], error: null },
      { data: null, error: null }, { data: null, error: null, count: 1 });
    mock.remove.mockResolvedValue({ data: null, error: { message: "Storage unavailable" } });
    expect(await permanentlyDeleteResource("resource", "DELETE")).toEqual({ removed: 0, pending: 1, errors: ["Storage unavailable"] });
    expect(mock.builders[1].update).toHaveBeenCalledWith({ attempts: 3, last_error: "Storage unavailable" });
    expect(mock.remove).toHaveBeenCalledWith(["old/path"]);
    expect(mock.builders[0].lte).toHaveBeenCalledWith("not_before", expect.any(String));
  });
  it("acknowledges cleanup only after Storage removal succeeds", async () => {
    mock.results.push({ data: [{ storage_path: "old/path" }], error: null }, { data: null, error: null }, { data: null, error: null, count: 0 });
    expect(await permanentlyDeleteResource("resource", "DELETE")).toEqual({ removed: 1, pending: 0, errors: [] });
    expect(mock.builders[1].delete).toHaveBeenCalled();
    expect(mock.remove.mock.invocationCallOrder[0]).toBeLessThan(mock.builders[1].delete.mock.invocationCallOrder[0]);
  });
  it("allows only admins to expire reservations and retry the bounded cleanup queue", async () => {
    mock.identity.mockResolvedValue({ roles: ["author"], accountStage: "active" });
    await expect(retryResourceCleanup()).rejects.toThrow("Not authorized");
    mock.identity.mockResolvedValue({ roles: ["super_admin"], accountStage: "active" });
    mock.results.push({ data: [], error: null }, { data: null, error: null, count: 0 });
    expect(await retryResourceCleanup()).toEqual({ expired: 0, removed: 0, pending: 0, errors: [] });
    expect(mock.serviceRpc).toHaveBeenCalledWith("expire_resource_uploads");
    expect(mock.builders[0].limit).toHaveBeenCalledWith(100);
  });
});
