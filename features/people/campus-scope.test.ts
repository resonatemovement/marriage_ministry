import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { peopleGroupSelection, peopleProfileSelection } from "./selections";

describe("Campus Lead People query boundary", () => {
  it("requests groups and profiles through the RLS-protected relations without a client-side scope override", () => {
    expect(peopleGroupSelection).toContain("campus:campuses(name)");
    expect(peopleProfileSelection).toContain("campus:campuses(name)");
  });

  const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260911090100_add_campus_lead_scope.sql"), "utf8");

  it("uses the same campus-oversees RLS predicate for Campus A Coach and Couple group access, excluding Campus B", () => {
    const groupScope = migration.match(/create or replace function private\.current_user_can_access_group[\s\S]*?\$\$;/)?.[0] ?? "";
    const profileScope = migration.match(/create or replace function private\.current_user_can_access_profile[\s\S]*?\$\$;/)?.[0] ?? "";

    expect(groupScope).toContain("private.current_user_oversees_campus(campus_id)");
    expect(profileScope).toContain("current_user_oversees_campus(profile.campus_id)");
  });

  it("keeps Counselor visibility within the existing group-access and supervision relationships", () => {
    const groupScope = migration.match(/create or replace function private\.current_user_can_access_group[\s\S]*?\$\$;/)?.[0] ?? "";

    expect(groupScope).toContain("supervision.counselor_group_id = target_group_id");
    expect(groupScope).not.toContain("group_type = 'counselor_team'");
  });
});
