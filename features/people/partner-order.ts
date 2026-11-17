export type PartnerGender = "male" | "female" | null;
export type GenderedPartner = { gender?: PartnerGender };

export type CoupleGenderIssue = "both_missing" | "one_missing" | "same_gender" | null;

/** Identifies incomplete or contradictory gender data without changing records. */
export function coupleGenderIssue(partners: readonly GenderedPartner[]): CoupleGenderIssue {
  if (partners.length !== 2) return null;
  const [first, second] = partners;
  if (!first?.gender && !second?.gender) return "both_missing";
  if (!first?.gender || !second?.gender) return "one_missing";
  return first.gender === second.gender ? "same_gender" : null;
}

/** Orders a two-person Couple male-first; inferred complements affect order only. */
export function orderCouplePartners<T extends GenderedPartner>(partners: readonly T[]): T[] {
  const ordered = [...partners];
  const genderIssue = coupleGenderIssue(ordered);
  if (ordered.length !== 2 || genderIssue === "both_missing" || genderIssue === "same_gender") return ordered;

  const firstGender = ordered[0]?.gender ?? (ordered[1]?.gender === "male" ? "female" : "male");
  const secondGender = ordered[1]?.gender ?? (ordered[0]?.gender === "male" ? "female" : "male");
  if (firstGender === "female" && secondGender === "male") return [ordered[1], ordered[0]];
  return ordered;
}
