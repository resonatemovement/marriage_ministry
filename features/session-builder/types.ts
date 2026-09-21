import type { SessionStatus } from "./model";

export interface SessionSummary {
  id: string;
  sequenceNumber: number;
  title: string;
  status: SessionStatus;
  updatedAt: string;
}

export type MaterialBlockType = "rich_text" | "video_link";

export interface SessionMaterialBlock {
  id: string;
  sessionId: string;
  blockType: MaterialBlockType;
  position: number;
  title: string | null;
  richTextContent: Record<string, unknown> | null;
  url: string | null;
  description: string | null;
}
