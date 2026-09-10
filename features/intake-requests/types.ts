import type { IntakeRequestStatus } from "./model";

export type IntakePerson = { id: string; personPosition: "requester" | "partner"; firstName: string; lastName: string; email: string; phone: string; city: string; resonateConnections: string[] };
export type IntakeRequestSummary = { id: string; status: IntakeRequestStatus; relationshipStatus: "pre_engaged" | "engaged" | "married"; campusName: string | null; requestedSupport: string[]; submittedAt: string; people: IntakePerson[] };
export type IntakeStatusHistory = { id: number; fromStatus: IntakeRequestStatus | null; toStatus: IntakeRequestStatus; changedAt: string; changedByName: string | null; note: string | null; reasonCode: string | null; reasonDetail: string | null };
export type IntakeRequestDetail = IntakeRequestSummary & { weddingDate: string | null; campusOther: string | null; currentlyWorkingWithCounselor: boolean; goals: string; questions: string | null; referralSource: string; referralSourceOther: string | null; history: IntakeStatusHistory[] };
