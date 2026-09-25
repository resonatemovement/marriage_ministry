import "server-only";

import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.generated";

export type HomeworkDraftContext = {
  id: string | null;
  status: "draft" | "published";
  basedOnVersionNumber: number | null;
  blocks: HomeworkDraftBlock[];
};

export type HomeworkDraftBlock = {
  id: string;
  homeworkBlockId: string;
  blockType: string;
  position: number;
  title: string | null;
  richTextContent: Json | null;
  url: string | null;
  description: string | null;
  clientId?: string | null;
};

export type HomeworkDraftLoadResult =
  | { draft: HomeworkDraftContext }
  | { error: "withdrawn" | "unavailable" };

export const initializeHomeworkDraftForSession = cache(async (sessionId: string, sessionStatus: "draft" | "published" = "draft"): Promise<HomeworkDraftLoadResult> => {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: homework, error: homeworkError } = await supabase.from("homeworks")
      .select("id,withdrawn_at").eq("session_id", sessionId).maybeSingle();
    if (homeworkError) return { error: "unavailable" };
    if (homework?.withdrawn_at) return { error: "withdrawn" };

    if (!homework && sessionStatus === "published") {
      return { draft: { id: null, status: "draft", basedOnVersionNumber: null, blocks: [] } };
    }

    let selectedVersion: { id: string; status: "draft" | "published"; based_on_version_id: string | null; version_number: number | null } | null = null;
    if (homework) {
      const { data: versions, error: versionsError } = await supabase.from("homework_versions")
        .select("id,status,based_on_version_id,version_number")
        .eq("homework_id", homework.id)
        .order("created_at", { ascending: false });
      if (versionsError) return { error: "unavailable" };
      const existingDraft = versions?.find((version) => version.status === "draft");
      const latestPublished = versions?.find((version) => version.status === "published");
      selectedVersion = existingDraft ?? (sessionStatus === "published" ? latestPublished ?? null : null);
    }

    if (!selectedVersion) {
      const { data: draftId, error: initializeError } = await supabase.rpc(
        "get_or_create_homework_draft_for_session",
        { target_session_id: sessionId },
      );
      if (initializeError) return { error: initializeError.message.includes("Homework is withdrawn") ? "withdrawn" : "unavailable" };
      if (!draftId) return { error: "unavailable" };
      const { data: draft, error: draftError } = await supabase.from("homework_versions")
        .select("id,status,based_on_version_id,version_number").eq("id", draftId).maybeSingle();
      if (draftError || !draft || draft.status !== "draft") return { error: "unavailable" };
      selectedVersion = draft;
    }

    const [{ data: blocks, error: blocksError }, sourceResult] = await Promise.all([
      supabase.from("homework_version_blocks")
        .select("id,homework_block_id,block_type,position,title,rich_text_content,url,description")
        .eq("homework_version_id", selectedVersion.id)
        .order("position", { ascending: true }),
      selectedVersion.based_on_version_id
        ? supabase.from("homework_versions").select("version_number").eq("id", selectedVersion.based_on_version_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (blocksError || sourceResult.error || (selectedVersion.based_on_version_id && !sourceResult.data)) return { error: "unavailable" };

    return {
      draft: {
        id: selectedVersion.id,
        status: selectedVersion.status,
        basedOnVersionNumber: sourceResult.data?.version_number ?? selectedVersion.version_number ?? null,
        blocks: (blocks ?? []).map((block) => ({
          id: block.id,
          homeworkBlockId: block.homework_block_id,
          blockType: block.block_type,
          position: block.position,
          title: block.title,
          richTextContent: block.rich_text_content,
          url: block.url,
          description: block.description,
        })),
      },
    };
  } catch {
    return { error: "unavailable" };
  }
});
