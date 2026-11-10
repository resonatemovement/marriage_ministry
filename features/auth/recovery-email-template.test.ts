import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const templatePath = resolve(process.cwd(), "supabase/templates/auth-recovery.html");
const subjectPath = resolve(process.cwd(), "supabase/templates/auth-recovery.subject.txt");

describe("Supabase recovery email template", () => {
  it("keeps the shared activation and password-reset recovery link contract", async () => {
    const html = await readFile(templatePath, "utf8");
    expect(html).toContain("{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery");
    expect(html).toContain("Set up your password");
    expect(html).toContain("Set Password");
    expect(await readFile(subjectPath, "utf8")).toContain("Set up or reset your Resonate password");
  });

  it("uses the public official logo and email-safe responsive markup", async () => {
    const html = await readFile(templatePath, "utf8");
    expect(html).toContain('src="https://marriage-ministry-dev.vercel.app/images/logo-email.png"');
    expect(html).toContain('alt="Resonate logo"');
    expect(html).toContain('name="viewport"');
    expect(html).toContain("width:100%;max-width:560px");
    expect(html).toContain("style=");
    expect(html).not.toMatch(/<script\b|<form\b/i);
  });
});
