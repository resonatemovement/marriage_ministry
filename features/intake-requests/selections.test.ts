import { describe, expect, it } from "vitest";

import { intakeDetailSelection } from "./selections";

describe("Intake detail selection", () => {
  it("includes every submitted intake and person field needed by the admin review", () => {
    for (const field of ["relationship_status", "wedding_date", "campus_other", "currently_working_with_counselor", "requested_support", "goals", "questions", "referral_source", "referral_source_other", "first_name", "last_name", "email", "phone", "city", "resonate_connections"]) expect(intakeDetailSelection).toContain(field);
  });
});
