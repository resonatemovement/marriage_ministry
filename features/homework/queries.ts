import "server-only";

import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database.generated";
import type { HomeworkPage } from "./homework-editor-model";

export type HomeworkDraftContext = {
  id: string | null;
  status: "draft" | "published";
  basedOnVersionNumber: number | null;
  blocks: HomeworkDraftBlock[];
  pages?: HomeworkPage[];
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
  questionChoices?: Json | null;
  isRequired?: boolean;
  clientId?: string | null;
  pageId?: string | null;
};

function pageManifest(value: unknown): HomeworkPage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => item && typeof item === "object" && !Array.isArray(item)
    && typeof item.id === "string" && typeof item.title === "string" && typeof item.position === "number"
    ? [{ id: item.id, title: item.title, position: item.position }] : []);
}

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
      return { draft: { id: null, status: "draft", basedOnVersionNumber: null, blocks: [], pages: [] } };
    }

    let selectedVersion: { id: string; status: "draft" | "published"; based_on_version_id: string | null; version_number: number | null; page_manifest?: unknown } | null = null;
    if (homework) {
      const { data: versions, error: versionsError } = await supabase.from("homework_versions")
        .select("*")
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
        .select("*").eq("id", draftId).maybeSingle();
      if (draftError || !draft || draft.status !== "draft") return { error: "unavailable" };
      selectedVersion = draft;
    }

    const [{ data: blocks, error: blocksError }, sourceResult] = await Promise.all([
      supabase.from("homework_version_blocks")
        .select("*")
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
        blocks: ((blocks ?? []) as Array<Database["public"]["Tables"]["homework_version_blocks"]["Row"] & { page_id?: string | null }>).map((block) => ({
          id: block.id,
          homeworkBlockId: block.homework_block_id,
          blockType: block.block_type,
          position: block.position,
          title: block.title,
          richTextContent: block.rich_text_content,
          url: block.url,
          description: block.description,
          questionChoices: block.question_choices,
          isRequired: block.is_required,
          pageId: (block as unknown as { page_id?: string | null }).page_id,
        })),
        pages: pageManifest(selectedVersion.page_manifest),
      },
    };
  } catch {
    return { error: "unavailable" };
  }
});
