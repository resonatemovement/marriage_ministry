export type PhotoHandoffState = "active" | "completed" | "expired" | "invalid";

export function handoffMessage(state: PhotoHandoffState) {
  if (state === "expired") return "This photo handoff has expired. Return to your computer and start a new handoff.";
  if (state === "completed") return "This photo handoff has already been completed.";
  return "This photo handoff is no longer valid.";
}
