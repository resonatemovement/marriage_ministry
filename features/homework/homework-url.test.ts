import { describe, expect, it } from "vitest";

import { isValidMaterialUrl } from "@/features/session-builder/model";
import { isValidHomeworkVideoUrl } from "./homework-url";

describe("Homework Video / Link URL contract", () => {
  it.each(["http://example.com/video", "https://www.example.com/video"])("accepts hosted URL %s", (url) => {
    expect(isValidHomeworkVideoUrl(url)).toBe(true);
  });

  it.each(["not a URL", "https://", "ftp://example.com/video", "https://service_name.example/video", " https://example.com/video "])("rejects URL that violates the Homework database rule: %s", (url) => {
    expect(isValidHomeworkVideoUrl(url)).toBe(false);
  });

  it("rejects underscore hostnames that the generic HTTP(S) helper accepts", () => {
    const url = "https://service_name.example/video";
    expect(isValidMaterialUrl(url)).toBe(true);
    expect(isValidHomeworkVideoUrl(url)).toBe(false);
  });
});
