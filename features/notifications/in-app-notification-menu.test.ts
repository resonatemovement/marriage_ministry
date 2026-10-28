import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { InAppNotificationMenu, inAppNotificationHref, type InAppNotification } from "./in-app-notification-menu";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./in-app-actions", () => ({ markInAppNotificationRead: vi.fn() }));
vi.mock("@/components/ui/dropdown-menu", () => {
  const Wrapper = ({ children, asChild, ...props }: { children?: React.ReactNode; asChild?: boolean } & Record<string, unknown>) => { void asChild; return createElement("div", props, children); };
  const Trigger = ({ children, asChild, ...props }: { children?: React.ReactNode; asChild?: boolean } & Record<string, unknown>) => { void asChild; return createElement("button", props, children); };
  return {
    DropdownMenu: Wrapper,
    DropdownMenuContent: Wrapper,
    DropdownMenuItem: Wrapper,
    DropdownMenuLabel: Wrapper,
    DropdownMenuSeparator: () => createElement("hr"),
    DropdownMenuTrigger: Trigger,
  };
});

const notification: InAppNotification = {
  id: "notification-1",
  notification_type: "homework_reopened",
  title: "Homework Reopened",
  message: "Your previous answers are preserved. Please review them and resubmit your Homework.",
  case_session_id: "case-session-1",
  created_at: "2026-10-28T12:00:00.000Z",
  read_at: null,
};

describe("Couple in-app notification surface", () => {
  it("shows accessible unread count and notification content", () => {
    const markup = renderToStaticMarkup(createElement(InAppNotificationMenu, { notifications: [notification] }));
    expect(markup).toContain('aria-label="Notifications, 1 unread"');
    expect(markup).toContain(">1</span>");
    expect(markup).toContain("Homework Reopened");
    expect(markup).toContain("Your previous answers are preserved.");
    expect(markup).toContain('dateTime="2026-10-28T12:00:00.000Z"');
  });

  it("uses the assigned Case Session Homework tab as the notification destination", () => {
    expect(inAppNotificationHref(notification)).toBe("/workspace/sessions/case-session-1?tab=homework");
  });

  it("removes the unread indicator after notifications are read", () => {
    const markup = renderToStaticMarkup(createElement(InAppNotificationMenu, { notifications: [{ ...notification, read_at: "2026-10-28T12:05:00.000Z" }] }));
    expect(markup).toContain('aria-label="Notifications"');
    expect(markup).not.toContain("unread");
  });
});
