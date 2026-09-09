import { describe, expect, it } from "vitest";
import { invitationSuccessMessage } from "./invitation-messages";

describe("invitation delivery messages", () => {
  it("formats complete standalone delivery", () => expect(invitationSuccessMessage({ names: ["Jordan Smith"], delivery: "complete" })).toBe("Invitation sent to Jordan Smith."));
  it("formats complete grouped delivery", () => expect(invitationSuccessMessage({ names: ["Jordan Smith", "Taylor Chen"], delivery: "complete" })).toBe("Invitations sent to Jordan Smith and Taylor Chen."));
  it("reports partial delivery without claiming both were sent", () => expect(invitationSuccessMessage({ names: ["Jordan Smith", "Taylor Chen"], delivery: "partial" })).toBe("One invitation was sent, but the second could not be delivered."));
});
