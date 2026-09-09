type DeliveryResult = { names: string[]; delivery: "complete" | "partial" };

export function invitationSuccessMessage(result: DeliveryResult) {
  if (result.delivery === "partial") return "One invitation was sent, but the second could not be delivered.";
  return result.names.length === 1 ? `Invitation sent to ${result.names[0]}.` : `Invitations sent to ${result.names.join(" and ")}.`;
}
