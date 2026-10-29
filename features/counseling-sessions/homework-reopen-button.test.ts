import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./homework-reopen-actions", () => ({ reopenParticipantHomework: vi.fn() }));
vi.mock("@/components/ui/alert-dialog", () => {
  const Wrapper = ({ children }: { children?: React.ReactNode }) => createElement("div", null, children);
  const Button = ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => createElement("button", props, children);
  return {
    AlertDialog: Wrapper,
    AlertDialogTrigger: Wrapper,
    AlertDialogContent: Wrapper,
    AlertDialogHeader: Wrapper,
    AlertDialogTitle: Wrapper,
    AlertDialogDescription: Wrapper,
    AlertDialogFooter: Wrapper,
    AlertDialogAction: Button,
    AlertDialogCancel: Button,
  };
});
vi.mock("@/components/ui/dropdown-menu", () => {
  const Wrapper = ({ children }: { children?: React.ReactNode }) => createElement("div", null, children);
  const Trigger = ({ children, asChild, ...props }: { children?: React.ReactNode; asChild?: boolean } & Record<string, unknown>) => { void asChild; return createElement("button", props, children); };
  const Item = ({ children, onSelect, ...props }: { children?: React.ReactNode; onSelect?: () => void } & Record<string, unknown>) => { void onSelect; return createElement("button", { ...props, role: "menuitem" }, children); };
  return { DropdownMenu: Wrapper, DropdownMenuTrigger: Trigger, DropdownMenuContent: Wrapper, DropdownMenuItem: Item };
});

import { ReopenHomeworkButton } from "./homework-reopen-button";

describe("Counselor Homework Reopen confirmation", () => {
  it("explains the exact effects and provides Cancel and Reopen actions", () => {
    const markup = renderToStaticMarkup(createElement(ReopenHomeworkButton, { caseId: "case-1", progressId: "progress-1", partnerName: "Alex" }));
    expect(markup).toContain('aria-label="Homework actions for Alex"');
    expect(markup).toContain('role="menuitem">Reopen Homework</button>');
    expect(markup).toContain("Status will change to In Progress.");
    expect(markup).toContain("Existing answers will be preserved");
    expect(markup).toContain("partner must resubmit");
    expect(markup).toContain("in-app notification");
    expect(markup).toContain(">Cancel</button>");
    expect(markup).toContain(">Reopen Homework</button>");
    expect(markup).not.toContain(">Reopen<span");
    expect(markup).not.toContain("reason");
    expect(markup).not.toContain("Type to confirm");
  });

  it("opens the existing confirmation dialog from the keyboard-operable menu item", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("./homework-reopen-button.tsx", import.meta.url), "utf8"));
    expect(source).toContain("<DropdownMenuItem onSelect={() => setOpen(true)}>Reopen Homework</DropdownMenuItem>");
    expect(source).toContain("<AlertDialog open={open} onOpenChange=");
    expect(source).toContain("reopenParticipantHomework(caseId, progressId)");
  });
});
