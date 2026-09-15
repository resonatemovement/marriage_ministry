import { describe, expect, it } from "vitest";

import { teamDeleteBlockerMessage } from "./person-lifecycle-messages";

describe("teamDeleteBlockerMessage", () => {
  it("explains retained Intake Request history without exposing database details", () => {
    expect(teamDeleteBlockerMessage("team_delete_blocker:intake_request_history")).toBe("This team is linked to retained Intake Request history and cannot be permanently deleted.");
  });

  it("includes authoritative Intake couple names when available", () => {
    expect(teamDeleteBlockerMessage("team_delete_blocker:intake_request_history", "Jacob Mitchel & Janice Price")).toBe("This Couple is linked to the retained Intake Request for Jacob Mitchel & Janice Price and cannot be permanently deleted.");
  });

  it("keeps unknown database failures generic", () => {
    expect(teamDeleteBlockerMessage("foreign key constraint groups_id_fkey")).toBe("This team cannot be permanently deleted because it has retained ministry history or another protected dependency.");
  });
});
