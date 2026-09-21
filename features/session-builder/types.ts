import type { SessionStatus } from "./model";

export interface SessionSummary {
  id: string;
  sequenceNumber: number;
  title: string;
  status: SessionStatus;
  updatedAt: string;
}
