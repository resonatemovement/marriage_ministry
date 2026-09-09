import { MarriageMinistryLandingPage } from "@/features/public/landing-page";
import { getAuthenticatedIdentity } from "@/lib/auth/session";

export default async function RootRoute() {
  const identity = await getAuthenticatedIdentity();
  return <MarriageMinistryLandingPage signedIn={identity?.accountStage === "active" && identity.workspaces.length > 0} />;
}
