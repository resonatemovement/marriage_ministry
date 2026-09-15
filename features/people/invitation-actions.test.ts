import { describe, expect, it } from "vitest";

import { invitationPayloadFromForm } from "./invitation-validation";

describe("Invite People payload", () => {
  it("keeps Couple partners and their normalized phones independent", () => {
    const form = new FormData();
    form.set("role", "couple"); form.set("campusId", " campus-a ");
    form.set("firstName0", "Jordan"); form.set("lastName0", "Smith"); form.set("email0", "JORDAN@example.com"); form.set("phone0", "(555) 555-1212");
    form.set("firstName1", "Taylor"); form.set("lastName1", "Chen"); form.set("email1", "TAYLOR@example.com"); form.set("phone1", "(555) 555-1213");
    expect(invitationPayloadFromForm(form)).toEqual({ role: "couple", campusId: "campus-a", invitees: [
      { first_name: "Jordan", last_name: "Smith", email: "jordan@example.com", phone: "+15555551212" },
      { first_name: "Taylor", last_name: "Chen", email: "taylor@example.com", phone: "+15555551213" },
    ] });
  });

  it("preserves the existing single-person payload contract", () => {
    const form = new FormData(); form.set("role", "author"); form.set("campusId", "campus-a"); form.set("firstName0", "Avery"); form.set("lastName0", "Lee"); form.set("email0", "AVERY@example.com");
    expect(invitationPayloadFromForm(form)).toEqual({ role: "author", campusId: "campus-a", invitees: [{ first_name: "Avery", last_name: "Lee", email: "avery@example.com", phone: "" }] });
  });
});
