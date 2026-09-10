import { describe, expect, it } from "vitest";
import { isInvitationEmail, validateInvitation } from "./invitation-validation";

const person = (email: string) => ({ firstName: "Jordan", lastName: "Smith", email });

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

  it("reserves Couple invitations for the Intake workflow and keeps teams grouped", () => {
    expect(validateInvitation("couple", "campus", [person("one@example.com"), person("two@example.com")]).role).toContain("valid");
    expect(validateInvitation("coach", "campus", [person("Person@example.com"), person(" person@example.com ")]).email1).toContain("different");
    expect(validateInvitation("coach", "campus", [person("one@example.com"), { firstName: "Taylor", lastName: "Chen", email: "two@example.com" }])).toEqual({});
  });
});
