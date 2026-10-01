import { hasAdministrativeAccess, type AppRole } from "@/lib/counseling/domain";

const MB = 1024 * 1024;
export const RESOURCE_POLICY = {
  bucket: "resource-library",
  previousVersions: 3,
  accessSeconds: 300,
  categories: {
    image: { maxBytes: 15 * MB, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"] },
    document: { maxBytes: 25 * MB, mimeTypes: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] },
    audio: { maxBytes: 75 * MB, mimeTypes: ["audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav", "audio/x-m4a"] },
    video: { maxBytes: 250 * MB, mimeTypes: ["video/mp4", "video/webm"] },
  },
} as const;

export type ResourceCategory = keyof typeof RESOURCE_POLICY.categories;
export type ResourceActor = { id: string; roles: readonly AppRole[] };
export type ResourceFile = { category: ResourceCategory; mimeType: string; sizeBytes: number; originalFilename: string };
export type ResourceMetadata = { title: string; description?: string | null };

export function resourceCategoryForMime(mimeType: string): ResourceCategory | null {
  return (Object.entries(RESOURCE_POLICY.categories).find(([, rule]) =>
    (rule.mimeTypes as readonly string[]).includes(mimeType),
  )?.[0] as ResourceCategory | undefined) ?? null;
}

export function resourceTitleFromFilename(filename: string) {
  return filename.replace(/\.[^.]+$/, "").trim();
}

export function formatResourceFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = sizeBytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(size)} ${units[unit]}`;
}

const RESOURCE_FILE_TYPE_LABELS: Record<string, string> = {
  "image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP", "image/avif": "AVIF",
  "application/pdf": "PDF", "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "audio/mpeg": "MP3", "audio/mp4": "M4A", "audio/aac": "AAC", "audio/wav": "WAV", "audio/x-wav": "WAV", "audio/x-m4a": "M4A",
  "video/mp4": "MP4", "video/webm": "WEBM",
};

export function formatResourceFileType(mimeType: string) {
  return RESOURCE_FILE_TYPE_LABELS[mimeType.toLowerCase()] ?? "FILE";
}

export function resourceFileAccept() {
  return Object.values(RESOURCE_POLICY.categories).flatMap((rule) => rule.mimeTypes).join(",");
}

export function validateResourceFile(file: ResourceFile) {
  const rule = RESOURCE_POLICY.categories[file.category];
  if (!rule || !(rule.mimeTypes as readonly string[]).includes(file.mimeType)) {
    throw new Error("Unsupported Resource MIME type/category");
  }
  if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0 || file.sizeBytes > rule.maxBytes) {
    throw new Error("Resource exceeds its category size limit or is empty");
  }
  if (!file.originalFilename.trim() || file.originalFilename.length > 255 || /[\u0000-\u001f\u007f]/.test(file.originalFilename)) {
    throw new Error("Invalid original filename");
  }
  return file;
}

export function validateResourceMetadata(metadata: ResourceMetadata) {
  const title = metadata.title.trim();
  const description = metadata.description?.trim() || null;
  if (!title || title.length > 180 || (description?.length ?? 0) > 4000) {
    throw new Error("Invalid Resource title/description");
  }
  return { title, description };
}

export function sanitizeResourceFilename(filename: string) {
  return filename.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 160) || "file";
}

export function canBrowseResources(actor: ResourceActor) {
  return hasAdministrativeAccess(actor.roles) || actor.roles.includes("author");
}

export function canManageResource(actor: ResourceActor, resource: { created_by: string; archived_at: string | null }) {
  return hasAdministrativeAccess(actor.roles)
    || (actor.roles.includes("author") && actor.id === resource.created_by && resource.archived_at === null);
}

// Future explicit version-pinning consumers must extend protection before enabling pruning.
export function resourcePruningCandidates<T extends { id: string; version_number: number }>(
  versions: readonly T[], currentId: string, protectedIds: ReadonlySet<string> = new Set(),
) {
  const previous = versions.filter((version) => version.id !== currentId)
    .sort((a, b) => b.version_number - a.version_number);
  return previous.slice(RESOURCE_POLICY.previousVersions).filter((version) => !protectedIds.has(version.id));
}
