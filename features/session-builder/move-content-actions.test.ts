import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, requireAccess, supabaseClient } = vi.hoisted(() => {
  const client = { rpc: vi.fn(function (this: unknown, ...args: unknown[]) { return rpc.apply(this, args); }) };
  return { rpc: vi.fn(), requireAccess: vi.fn(), supabaseClient: client };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => supabaseClient) }));
vi.mock("./access", () => ({ requireSessionBuilderAccess: requireAccess }));

import { moveSessionBuilderContent, type MoveContentInput } from "./move-content-actions";

describe("cross-Session Homework move boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects direct Homework block move requests before calling the database", async () => {
    const input = {
      sourceSessionId: "source-session",
      destinationSessionId: "destination-session",
      kind: "homework_block",
      itemId: "block-id",
    } as unknown as MoveContentInput;

    const result = await moveSessionBuilderContent(input);

    expect(requireAccess).toHaveBeenCalledWith("/session-builder/source-session");
    expect(result).toEqual({ ok: false, error: "Homework items can only be moved as a complete page" });
    expect(supabaseClient.rpc).not.toHaveBeenCalled();
  });

  it("rejects unknown move kinds before calling the database", async () => {
    const input = {
      sourceSessionId: "source-session",
      destinationSessionId: "destination-session",
      kind: "unrecognized",
      itemId: "block-id",
    } as unknown as MoveContentInput;

    const result = await moveSessionBuilderContent(input);

    expect(result).toEqual({ ok: false, error: "Invalid Session content move" });
    expect(supabaseClient.rpc).not.toHaveBeenCalled();
  });
});
