import { PublicIntakeForm } from "@/features/intake-request-form/public-intake-form";
import { getPublicCampuses } from "@/features/intake-request-form/campuses";

export default async function CounselingRequestRoute() {
  const campuses = await getPublicCampuses();
  return <PublicIntakeForm campuses={campuses} />;
}
