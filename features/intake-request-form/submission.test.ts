import { describe, expect, it } from "vitest";

import { emptyDraft } from "./validation";
import {
  mapIntakeDraftToSubmissionPayload,
  publicSubmissionError,
  toCreateIntakeRequestRpcArgs,
  validateIntakeSubmission,
} from "./submission";

const campusId = "11111111-1111-4111-8111-111111111111";

function validDraft() {
  const draft = emptyDraft();
  draft.you = { firstName: " Avery ", lastName: " Requester ", phone: "(415) 555-0101", email: " AVERY@EXAMPLE.COM ", city: " San Francisco ", connections: ["member"] };
  draft.partner = { firstName: " Blair ", lastName: " Partner ", phone: "415-555-0102", email: "BLAIR@example.com", city: " Oakland ", connections: ["mc"] };
  draft.relationshipStatus = "engaged";
  draft.weddingDate = "2027-06-12";
  draft.campusId = campusId;
  draft.workingWithCounselor = "no";
  draft.requestedSupport = ["lay_counselor"];
  draft.goals = " Build healthier communication. ";
  draft.questions = " What should we expect? ";
  draft.referralSource = "website";
  return draft;
}

describe("intake submission validation and mapping", () => {
  it("normalizes a complete form and maps date-only values for the RPC", () => {
    const draft = validDraft();
    const validation = validateIntakeSubmission(draft, [campusId]);
    expect("value" in validation).toBe(true);
    if (!("value" in validation)) return;
    expect(validation.value.people[0]).toMatchObject({ position: "requester", email: "avery@example.com", phone: "+14155550101", city: "San Francisco" });
    expect(validation.value.wedding_date).toBe("2027-06-12");
    expect(toCreateIntakeRequestRpcArgs(validation.value)).toEqual({ payload: validation.value });
  });

  it("maps blank City values to null and preserves trimmed values", () => {
    const draft = validDraft();
    draft.you.city = " ";
    const payload = mapIntakeDraftToSubmissionPayload(draft);
    expect(payload.people[0].city).toBeNull();
    expect(payload.people[1].city).toBe("Oakland");
    expect("value" in validateIntakeSubmission(draft, [campusId])).toBe(true);
  });

  it("rejects duplicate normalized emails and invalid phone numbers", () => {
    const draft = validDraft();
    draft.partner.email = " avery@example.com ";
    draft.partner.phone = "abc";
    const result = validateIntakeSubmission(draft, [campusId]);
    if (!("errors" in result)) return;
    expect(result.errors["partner.email"]).toContain("different");
    expect(result.errors["partner.phone"]).toContain("valid");
  });

  it("rejects unknown relationship, connection, support, and referral values", () => {
    const draft = validDraft();
    draft.relationshipStatus = "dating";
    draft.you.connections = ["unknown"];
    draft.requestedSupport = ["unknown"];
    draft.referralSource = "podcast";
    const result = validateIntakeSubmission(draft, [campusId]);
    if (!("errors" in result)) return;
    expect(result.errors.relationshipStatus).toBeTruthy();
    expect(result.errors["you.connections"]).toBeTruthy();
    expect(result.errors.requestedSupport).toBeTruthy();
    expect(result.errors.referralSource).toBeTruthy();
  });

  it("enforces active-campus and Other-campus rules", () => {
    const draft = validDraft();
    draft.campusId = "22222222-2222-4222-8222-222222222222";
    const inactiveCampus = validateIntakeSubmission(draft, [campusId]);
    expect("errors" in inactiveCampus && inactiveCampus.errors.campus).toContain("active");
    draft.campusId = "";
    draft.campusOther = "";
    const missingCampus = validateIntakeSubmission(draft, [campusId]);
    expect("errors" in missingCampus && missingCampus.errors.campus).toBeTruthy();
    draft.campusOther = "Neighborhood church";
    expect("value" in validateIntakeSubmission(draft, [campusId])).toBe(true);
  });

  it("requires Other referral text and rejects invalid date-only strings", () => {
    const draft = validDraft();
    draft.referralSource = "other";
    draft.weddingDate = "June 12, 2027";
    const result = validateIntakeSubmission(draft, [campusId]);
    if (!("errors" in result)) return;
    expect(result.errors.referralOther).toBeTruthy();
    expect(result.errors.weddingDate).toBeTruthy();
  });

  it("maps safe public errors without exposing database details", () => {
    expect(publicSubmissionError(new Error("Choose an active campus"))).toContain("active campus");
    expect(publicSubmissionError(new Error("SQLSTATE 23505: internal index"))).not.toContain("SQLSTATE");
  });

  it("keeps raw mapping separate from validation", () => {
    const draft = validDraft();
    draft.relationshipStatus = "not-a-status";
    expect(mapIntakeDraftToSubmissionPayload(draft).relationship_status).toBe("not-a-status");
    const result = validateIntakeSubmission(draft, [campusId]);
    expect("errors" in result && result.errors.relationshipStatus).toBeTruthy();
  });
});
