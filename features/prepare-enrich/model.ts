export const PREPARE_ENRICH_BUCKET = "assessment-documents";
export const PREPARE_ENRICH_SLOTS = ["counselor", "couple"] as const;
export type PrepareEnrichSlot = typeof PREPARE_ENRICH_SLOTS[number];
export type PrepareEnrichDocument = { id: string; slot: PrepareEnrichSlot; fileName: string; contentType: string; sizeBytes: number };
export function isPrepareEnrichSlot(value: string): value is PrepareEnrichSlot { return (PREPARE_ENRICH_SLOTS as readonly string[]).includes(value); }
