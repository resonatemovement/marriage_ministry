import { describe, expect, it } from "vitest";
import { isInvitationEmail, validateInvitation } from "./invitation-validation";

const person = (email: string, phone = "(555) 555-1212") => ({ firstName: "Jordan", lastName: "Smith", email, phone });

describe("Invite People validation", () => {
  it("accepts practical email addresses and rejects test@test", () => {
    expect(isInvitationEmail("test@test")).toBe(false);
    expect(isInvitationEmail("person@example.com")).toBe(true);
  });

  it("requires Campus and complete standalone fields", () => {
    expect(validateInvitation("author", "", [person("person@example.com")])).toEqual({ campus: "Choose an active Campus." });
    expect(validateInvitation("author", "campus", [{ firstName: "", lastName: "", email: "" }])).toMatchObject({ firstName0: expect.any(String), lastName0: expect.any(String), email0: expect.any(String) });
    expect(validateInvitation("author", "campus", [person("person@example.com")])).toEqual({});
  });

  it("accepts Couples as a two-person grouped invitation with independent required phones", () => {
    expect(validateInvitation("couple", "campus", [person("one@example.com"), person("two@example.com", "(555) 555-1213")])).toEqual({});
    expect(validateInvitation("couple", "campus", [person("one@example.com", ""), person("two@example.com", "invalid")])).toMatchObject({ phone0: expect.any(String), phone1: expect.any(String) });
    expect(validateInvitation("couple", "", [person("one@example.com"), person("two@example.com", "(555) 555-1213")])).toMatchObject({ campus: expect.any(String) });
    expect(validateInvitation("coach", "campus", [person("Person@example.com"), person(" person@example.com ")]).email1).toContain("different");
    expect(validateInvitation("coach", "campus", [person("one@example.com"), { firstName: "Taylor", lastName: "Chen", email: "two@example.com" }])).toEqual({});
  });
});
