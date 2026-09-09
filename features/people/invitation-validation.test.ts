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

  it("requires both grouped people and distinct normalized emails", () => {
    expect(validateInvitation("couple", "campus", [person("person@example.com"), { firstName: "", lastName: "", email: "" }])).toMatchObject({ firstName1: expect.any(String), lastName1: expect.any(String), email1: expect.any(String) });
    expect(validateInvitation("couple", "campus", [person("Person@example.com"), person(" person@example.com ")]).email1).toContain("different");
    expect(validateInvitation("couple", "campus", [person("one@example.com"), { firstName: "Taylor", lastName: "Chen", email: "two@example.com" }])).toEqual({});
  });
});
