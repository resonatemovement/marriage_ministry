export type PartnerGender = "male" | "female" | null;
export type GenderedPartner = { gender?: PartnerGender };

/** Orders only a two-person Couple when both authoritative genders differ. */
export function orderCouplePartners<T extends GenderedPartner>(partners: readonly T[]): T[] {
  const ordered = [...partners];
  if (ordered.length === 2 && ordered[0]?.gender === "female" && ordered[1]?.gender === "male") {
    return [ordered[1], ordered[0]];
  }
  return ordered;
}
