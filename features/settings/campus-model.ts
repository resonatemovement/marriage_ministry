interface CampusState {
  id: string;
  name: string;
  active: boolean;
}

export function normalizeCampusName(value: string) {
  return value.trim();
}

export function isSelectableCampus(campus: Pick<CampusState, "active">) {
  return campus.active;
}

export function canDisplayCampus(campus: Pick<CampusState, "active">, currentCampusId: string | null, campusId: string) {
  return isSelectableCampus(campus) || currentCampusId === campusId;
}
