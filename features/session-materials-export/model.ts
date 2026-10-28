export type SessionMaterialsExportRole = "couple" | "counselor" | "coach" | "campus_lead";

export type SessionMaterialsExportIdentity = { id: string; roles: readonly string[] };
export type SessionMaterialsExportAssignment = {
  assignmentType: "counselor" | "coach" | "campus_lead";
  assignedGroupId: string | null;
  assignedProfileId: string | null;
  endedAt: string | null;
};
export type SessionMaterialsExportTeam = { id: string; type: string; active: boolean };
export type SessionMaterialsExportMembership = { groupId: string; profileId: string; endedAt: string | null };
export type SessionMaterialsExportAccess = {
  coupleCaseId: string | null;
  assignments: readonly SessionMaterialsExportAssignment[];
  teams: readonly SessionMaterialsExportTeam[];
  memberships: readonly SessionMaterialsExportMembership[];
};

export function canExportSessionMaterials(identity: SessionMaterialsExportIdentity, caseId: string, access: SessionMaterialsExportAccess) {
  if (identity.roles.includes("couple") && access.coupleCaseId === caseId) return true;
  return access.assignments.some((assignment) => {
    if (assignment.endedAt !== null) return false;
    if (assignment.assignmentType === "campus_lead") return identity.roles.includes("campus_lead") && assignment.assignedProfileId === identity.id;
    const groupId = assignment.assignedGroupId;
    if (!groupId || !access.memberships.some((member) => member.profileId === identity.id && member.groupId === groupId && member.endedAt === null)) return false;
    return access.teams.some((team) => {
      if (team.id !== groupId || !team.active) return false;
      if (assignment.assignmentType === "coach") return team.type === "coach_team" && identity.roles.includes("coach");
      if (team.type === "counselor_team") return identity.roles.includes("counselor");
      if (team.type === "coach_team") return identity.roles.includes("coach");
      if (team.type === "campus_lead_team") return identity.roles.includes("campus_lead");
      return false;
    });
  });
}

export function sanitizeSessionPdfFilename(title: string) {
  const safeTitle = title.normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 120);
  return `${safeTitle || "Session Materials"}.pdf`;
}

function contentDisposition(filename: string, disposition: "inline" | "attachment") {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\;]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function contentDispositionInline(filename: string) {
  return contentDisposition(filename, "inline");
}

export function contentDispositionAttachment(filename: string) {
  return contentDisposition(filename, "attachment");
}

export function filenameFromContentDisposition(header: string | null) {
  if (!header) return null;
  const normalizeFilename = (filename: string) => sanitizeSessionPdfFilename(filename.replace(/\.pdf$/i, ""));
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return normalizeFilename(decodeURIComponent(encoded)); } catch { return null; }
  }
  const fallback = header.match(/filename="?([^";]+)"?/i)?.[1];
  return fallback ? normalizeFilename(fallback) : null;
}

export function safeHttpUrl(value: string) {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function resourceOpenUrl(baseUrl: string, resourceId: string, versionId: string) {
  const base = safeHttpUrl(baseUrl);
  if (!base || !resourceId || !versionId) return null;
  const url = new URL(`/resource-library/${encodeURIComponent(resourceId)}/open`, base);
  url.searchParams.set("version", versionId);
  return url.toString();
}

export type SessionMaterialsPdfBlock = {
  id: string;
  position: number;
  blockType: "rich_text" | "video_link" | "library_resource";
  title: string | null;
  richTextContent: unknown;
  url: string | null;
  description: string | null;
  resourceId: string | null;
  resourceVersionId: string | null;
  resourceCategory: "image" | "document" | "audio" | "video" | null;
  image: Buffer | null;
  imageWidth: number | null;
  imageHeight: number | null;
};

export function sessionSnapshotOrder<T extends { position: number }>(blocks: readonly T[]): T[] {
  return blocks.map((block, index) => ({ block, index }))
    .sort((first, second) => first.block.position - second.block.position || first.index - second.index)
    .map(({ block }) => block);
}
