import { describe, expect, it } from "vitest";
import { orderCouplePartners } from "./partner-order";

describe("orderCouplePartners", () => {
  const male = { id: "male", gender: "male" as const };
  const female = { id: "female", gender: "female" as const };

  it.each([[male, female], [female, male]])("puts the explicitly male partner first regardless of input order", (...partners) => {
    expect(orderCouplePartners(partners).map(({ id }) => id)).toEqual(["male", "female"]);
  });

  it("keeps incoming order when a gender is missing or both genders match", () => {
    expect(orderCouplePartners([{ id: "unknown", gender: null }, male]).map(({ id }) => id)).toEqual(["unknown", "male"]);
    expect(orderCouplePartners([female, { id: "also-female", gender: "female" }]).map(({ id }) => id)).toEqual(["female", "also-female"]);
  });

  it("does not reorder arrays that are not a two-person Couple", () => {
    expect(orderCouplePartners([female, male, { id: "other", gender: "male" }]).map(({ id }) => id)).toEqual(["female", "male", "other"]);
  });
});
