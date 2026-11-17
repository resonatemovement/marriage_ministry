import { describe, expect, it } from "vitest";
import { coupleGenderIssue, orderCouplePartners } from "./partner-order";

describe("orderCouplePartners", () => {
  const male = { id: "male", gender: "male" as const };
  const female = { id: "female", gender: "female" as const };

  it.each([[male, female], [female, male]])("puts the explicitly male partner first regardless of input order", (...partners) => {
    expect(orderCouplePartners(partners).map(({ id }) => id)).toEqual(["male", "female"]);
  });

  it("orders a pending invited partner with authoritative Intake gender", () => {
    const members = [
      { id: "active-male", gender: "male" as const, pending: false },
      { id: "pending-female", gender: "female" as const, pending: true },
    ];

    expect(orderCouplePartners(members).map(({ id }) => id)).toEqual(["active-male", "pending-female"]);
    expect(orderCouplePartners([...members].reverse()).map(({ id }) => id)).toEqual(["active-male", "pending-female"]);
  });

  it("orders two active members from their stored genders", () => {
    expect(orderCouplePartners([
      { id: "active-female", gender: "female" as const, pending: false },
      { id: "active-male", gender: "male" as const, pending: false },
    ]).map(({ id }) => id)).toEqual(["active-male", "active-female"]);
  });

  it("keeps each participant's fields attached to the same identity", () => {
    const femaleMember = { id: "female", gender: "female" as const, avatar: "female-photo", status: "onboarding" };
    const maleMember = { id: "male", gender: "male" as const, avatar: "male-photo", status: "active" };

    expect(orderCouplePartners([femaleMember, maleMember])).toEqual([maleMember, femaleMember]);
  });

  it("keeps stable order when both genders are missing or both match", () => {
    expect(orderCouplePartners([{ id: "unknown-a", gender: null }, { id: "unknown-b", gender: null }]).map(({ id }) => id)).toEqual(["unknown-a", "unknown-b"]);
    expect(orderCouplePartners([female, { id: "also-female", gender: "female" }]).map(({ id }) => id)).toEqual(["female", "also-female"]);
  });

  it("uses a display-only complementary gender to order a single known partner", () => {
    const maleAndUnknown = [{ id: "unknown", gender: null }, male];
    const femaleAndUnknown = [female, { id: "unknown", gender: null }];

    expect(orderCouplePartners(maleAndUnknown).map(({ id }) => id)).toEqual(["male", "unknown"]);
    expect(orderCouplePartners(femaleAndUnknown).map(({ id }) => id)).toEqual(["unknown", "female"]);
    expect(maleAndUnknown[0]?.gender).toBeNull();
    expect(femaleAndUnknown[1]?.gender).toBeNull();
  });

  it("identifies missing and inconsistent pairs without changing their values", () => {
    expect(coupleGenderIssue([{ gender: null }, { gender: null }])).toBe("both_missing");
    expect(coupleGenderIssue([{ gender: "male" }, { gender: null }])).toBe("one_missing");
    expect(coupleGenderIssue([male, { id: "also-male", gender: "male" }])).toBe("same_gender");
    expect(coupleGenderIssue([male, female])).toBeNull();
  });

  it("does not reorder arrays that are not a two-person Couple", () => {
    expect(orderCouplePartners([female, male, { id: "other", gender: "male" }]).map(({ id }) => id)).toEqual(["female", "male", "other"]);
  });
});
