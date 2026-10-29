import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const importer = readFileSync("supabase/imports/love_languages_v1.sql", "utf8");

function readChoiceSeed() {
  const seed = importer.match(/insert into _love_language_choice_seed \([^;]+\) values([\s\S]*?);/i)?.[1];
  if (!seed) throw new Error("Love Languages choice seed is missing");

  return [...seed.matchAll(/\(\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:''|[^'])*)'\s*,\s*'([^']+)'\s*\)/g)].map((match) => [
    Number(match[1]),
    Number(match[2]),
    match[3].replaceAll("''", "'"),
    match[4],
  ] as const);
}

describe("Love Languages v1 content import", () => {
  it("preserves all 30 paired-choice items in PDF order with the exact authored statements and scoring keys", () => {
    const choices = readChoiceSeed();
    const canonicalContent = choices.map((choice) => choice.join("\u001f")).join("\n");

    expect(choices).toHaveLength(60);
    expect(new Set(choices.map(([questionPosition]) => questionPosition)).size).toBe(30);
    expect(choices.map(([questionPosition, choicePosition]) => `${questionPosition}:${choicePosition}`)).toEqual(
      Array.from({ length: 30 }, (_, questionPosition) => [`${questionPosition}:0`, `${questionPosition}:1`]).flat(),
    );
    for (let questionPosition = 0; questionPosition < 30; questionPosition += 1) {
      expect(new Set(choices.filter(([position]) => position === questionPosition).map(([, , , key]) => key)).size).toBe(2);
    }
    expect(Object.fromEntries(
      [...new Set(choices.map(([, , , categoryKey]) => categoryKey))].sort().map((categoryKey) => [
        categoryKey,
        choices.filter(([, , , key]) => key === categoryKey).length,
      ]),
    )).toEqual({
      acts_of_service: 12,
      physical_touch: 12,
      quality_time: 12,
      receiving_gifts: 12,
      words_of_affirmation: 12,
    });
    expect(createHash("sha256").update(canonicalContent).digest("hex")).toBe(
      "10419cd493a8ab77908cb3b995691f2a87eef3f1e2c26d59c1846f0c497023bc",
    );
    expect(importer).toContain("'It’s more meaningful to me when…'");
  });

  it("targets only the existing empty Draft v1 and publishes through the authorized RPC", () => {
    expect(importer).toContain("definition.slug = 'love_languages' and version.version_number = 1");
    expect(importer).toContain("target_status <> 'draft'");
    expect(importer).toContain("question_total <> 0 or choice_total <> 0 or score_total <> 0");
    expect(importer).toContain("private.assessment_can_manage_catalog()");
    expect(importer).toContain("perform public.publish_assessment_version(target_version_id)");
    expect(importer).not.toMatch(/update\s+public\.assessment_versions\s+set\s+status\s*=\s*'published'/i);
    expect(importer).toContain("Published Love Languages v1 exists but does not match this import");
  });
});
