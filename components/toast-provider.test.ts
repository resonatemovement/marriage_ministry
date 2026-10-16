import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { toastProviderOptions } from "./toast-provider";

describe("application Sonner provider configuration", () => {
  it("uses the shared responsive, system-theme placement and accessible dismissal", () => {
    expect(toastProviderOptions).toMatchObject({
      position: "bottom-right",
      theme: "system",
      closeButton: true,
      duration: 4000,
      offset: 24,
      mobileOffset: { bottom: 16, left: 16, right: 16 },
    });
    expect(toastProviderOptions.toastOptions?.closeButtonAriaLabel).toBe("Dismiss notification");
  });

  it("uses existing success and error tokens with explicit status icons", () => {
    expect(toastProviderOptions.toastOptions?.classNames).toMatchObject({
      success: "border-success bg-success-soft text-success-strong",
      error: "border-danger bg-danger-soft text-danger-strong",
      toast: "rounded-lg border px-4 py-3 font-sans shadow-md",
    });
    expect(toastProviderOptions.icons?.success).toBeTruthy();
    expect(toastProviderOptions.icons?.error).toBeTruthy();
  });

  it("keeps one root-mounted toast provider", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout.match(/<ToastProvider\s*\/>/g)).toHaveLength(1);
  });
});
