import "server-only";

import { getAuthenticatedIdentity } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canExportSessionMaterials, sessionSnapshotOrder, type SessionMaterialsPdfBlock } from "./model";

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
const str = (row: Row | null | undefined, key: string) => typeof row?.[key] === "string" ? row[key] as string : null;

export type ExportSession = { title: string; blocks: SessionMaterialsPdfBlock[] };

export async function getAuthorizedSessionMaterials(caseSessionId: string): Promise<ExportSession | null> {
  const [identity, supabase] = await Promise.all([getAuthenticatedIdentity(), createServerSupabaseClient()]);
  if (!identity || identity.accountStage !== "active") return null;
  const { data: sessionValue, error: sessionError } = await supabase.from("case_sessions")
    .select("id,counseling_case_id,title,status")
    .eq("id", caseSessionId).in("status", ["active", "completed"]).maybeSingle();
  if (sessionError || !sessionValue) return null;
  const session = sessionValue as unknown as Row;
  const caseId = str(session, "counseling_case_id");
  if (!caseId) return null;

  let coupleCaseId: string | null = null;
  if (identity.roles.includes("couple")) {
    const { data } = await supabase.rpc("get_current_couple_case_team");
    coupleCaseId = typeof data?.[0]?.counseling_case_id === "string" ? data[0].counseling_case_id : null;
  }
  const assignments: Parameters<typeof canExportSessionMaterials>[2]["assignments"][number][] = [];
  const teams: Parameters<typeof canExportSessionMaterials>[2]["teams"][number][] = [];
  const memberships: Parameters<typeof canExportSessionMaterials>[2]["memberships"][number][] = [];
  if (coupleCaseId !== caseId) {
    const { data: assignmentRows, error: assignmentError } = await supabase.from("case_assignments")
      .select("assignment_type,assigned_group_id,assigned_profile_id,ended_at,assigned_group:groups!case_assignments_assigned_group_id_fkey(id,group_type,active,group_members(profile_id,ended_at))")
      .eq("counseling_case_id", caseId).is("ended_at", null);
    if (assignmentError) return null;
    for (const assignment of rows(assignmentRows)) {
      const type = str(assignment, "assignment_type");
      if (type !== "counselor" && type !== "coach" && type !== "campus_lead") continue;
      assignments.push({ assignmentType: type, assignedGroupId: str(assignment, "assigned_group_id"), assignedProfileId: str(assignment, "assigned_profile_id"), endedAt: str(assignment, "ended_at") });
      const team = assignment.assigned_group as Row | null;
      const teamId = str(team, "id");
      if (!team || !teamId) continue;
      teams.push({ id: teamId, type: str(team, "group_type") ?? "", active: team.active === true });
      for (const member of rows(team.group_members)) memberships.push({ groupId: teamId, profileId: str(member, "profile_id") ?? "", endedAt: str(member, "ended_at") });
    }
  }
  if (!canExportSessionMaterials(identity, caseId, { coupleCaseId, assignments, teams, memberships })) return null;

  const { data: materialValue, error: materialError } = await supabase.from("case_session_material_blocks")
    .select("*").eq("case_session_id", caseSessionId).order("position");
  if (materialError || !materialValue) throw new Error("Assigned Session Materials are unavailable");

  const rawBlocks = sessionSnapshotOrder(rows(materialValue).map((block) => ({
    row: block,
    position: Number(block.position),
  }))).map(({ row }) => row);
  const sharp = (await import("sharp")).default;
  const blocks: SessionMaterialsPdfBlock[] = [];
  for (const block of rawBlocks) {
    const resourceId = str(block, "resource_id");
    const versionId = str(block, "resource_version_id");
    let resourceTitle: string | null = null;
    let resourceDescription: string | null = null;
    let image: Buffer | null = null;
    let imageWidth: number | null = null;
    let imageHeight: number | null = null;
    if (str(block, "block_type") === "library_resource" && resourceId && versionId) {
      const { data: resource, error: resourceError } = await supabase.from("resources").select("title,description").eq("id", resourceId).maybeSingle();
      if (resourceError || !resource) throw new Error("Assigned Session Resource metadata is unavailable");
      resourceTitle = str(resource as unknown as Row, "title");
      resourceDescription = str(resource as unknown as Row, "description");
      const { data: version, error: versionError } = await supabase.from("resource_versions")
        .select("storage_path,mime_type,size_bytes").eq("resource_id", resourceId).eq("id", versionId).maybeSingle();
      if (versionError || !version) throw new Error("Pinned Session Resource is unavailable");
      if (str(block, "resource_category") === "image") {
        const mime = str(version as unknown as Row, "mime_type");
        const size = Number((version as unknown as Row).size_bytes);
        if (!mime || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(mime) || !Number.isFinite(size) || size > 15_000_000) {
          throw new Error("Pinned Session image is not safe to export");
        }
        const { data: file, error: downloadError } = await supabase.storage.from("resource-library").download(String((version as unknown as Row).storage_path));
        if (downloadError || !file) throw new Error("Pinned Session image is unavailable");
        const source = Buffer.from(await file.arrayBuffer());
        const metadata = await sharp(source, { limitInputPixels: 40_000_000 }).metadata();
        if (!metadata.width || !metadata.height || metadata.width * metadata.height > 40_000_000) throw new Error("Pinned Session image dimensions are unsafe");
        image = await sharp(source, { limitInputPixels: 40_000_000 }).resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).png().toBuffer();
        imageWidth = metadata.width;
        imageHeight = metadata.height;
      }
    } else if (str(block, "block_type") === "library_resource") {
      throw new Error("Pinned Session Resource reference is incomplete");
    }
    const blockType = str(block, "block_type");
    if (blockType !== "rich_text" && blockType !== "video_link" && blockType !== "library_resource") throw new Error("Unsupported Session material type");
    blocks.push({
      id: str(block, "id") ?? "", position: Number(block.position), blockType,
      title: str(block, "title") ?? resourceTitle, richTextContent: block.rich_text_content,
      url: str(block, "url"), description: str(block, "description") ?? resourceDescription,
      resourceId, resourceVersionId: versionId,
      resourceCategory: str(block, "resource_category") as SessionMaterialsPdfBlock["resourceCategory"],
      image, imageWidth, imageHeight,
    });
  }
  return { title: str(session, "title") ?? "Session Materials", blocks };
}
