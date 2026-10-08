import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261005100000_prepare_enrich_document_slots.sql"), "utf8");
const accessFix = readFileSync(resolve(process.cwd(), "supabase/migrations/20261005100500_fix_prepare_enrich_care_team_access.sql"), "utf8");

describe("Prepare & Enrich document-slot migration", () => {
  it("enforces one explicit slot per case and keeps Couple Version outside care-team policies", () => {
    expect(migration).toContain("document_slot in ('counselor', 'couple')");
    expect(migration).toContain("assessment_documents_one_slot_per_case_idx");
    expect(migration).toContain("(counseling_case_id, document_slot)");
    expect(migration).toContain("document_slot = 'counselor'");
    expect(migration).toContain("array['campus_lead', 'coach', 'counselor']");
    expect(accessFix).toContain("private.current_user_can_manage_counseling_case(counseling_case_id)");
    expect(accessFix).toContain("(storage.foldername(name))[2] = 'counselor'");
    expect(migration).not.toContain("all authenticated users");
  });
});
