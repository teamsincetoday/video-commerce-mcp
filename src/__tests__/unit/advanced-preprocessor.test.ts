import { describe, it, expect } from "vitest";
import {
  hasSufficientBotanicalContent,
  hasSufficientDomainContent,
  BOTANICAL_KEYWORDS,
  FILLER_WORDS,
  SPONSOR_PATTERNS,
  INTRO_OUTRO_PATTERNS,
} from "../../transcript/advanced-preprocessor.js";
import type { VerticalConfig } from "../../verticals/vertical-config.js";

const makeV = (aggressiveness: number, keywords: string[] = []): VerticalConfig =>
  ({ filteringAggressiveness: aggressiveness, contentSignals: { inclusionKeywords: keywords } } as unknown as VerticalConfig);

describe("hasSufficientBotanicalContent", () => {
  it("returns false for empty string", () =>
    expect(hasSufficientBotanicalContent("")).toBe(false));
  it("returns true with high botanical density", () =>
    expect(hasSufficientBotanicalContent("fern fern fern fern fern")).toBe(true));
  it("returns false with no botanical keywords", () => {
    expect(hasSufficientBotanicalContent(Array(100).fill("hello").join(" "))).toBe(false);
  });
  it("respects custom minDensity — passes 0.05", () =>
    expect(hasSufficientBotanicalContent("fern hello world test foo bar baz qux quux quuz", 0.05)).toBe(true));
  it("respects custom minDensity — fails 0.2", () =>
    expect(hasSufficientBotanicalContent("fern hello world test foo bar baz qux quux quuz", 0.2)).toBe(false));
});

describe("hasSufficientDomainContent", () => {
  it("returns true with no verticalConfig", () =>
    expect(hasSufficientDomainContent("anything")).toBe(true));
  it("returns true for low-aggressiveness vertical (<0.3)", () =>
    expect(hasSufficientDomainContent("no keywords here", makeV(0.2, ["widget"]))).toBe(true));
  it("returns true when inclusion keywords array is empty", () =>
    expect(hasSufficientDomainContent("anything", makeV(0.8, []))).toBe(true));
  it("returns false when density below threshold", () =>
    expect(hasSufficientDomainContent(Array(100).fill("hello").join(" "), makeV(0.8, ["widget"]))).toBe(false));
  it("returns true when density meets threshold", () =>
    expect(hasSufficientDomainContent("widget widget widget widget hello world foo bar baz qux", makeV(0.8, ["widget"]))).toBe(true));
  it("respects custom minDensity — high threshold fails", () =>
    expect(hasSufficientDomainContent("widget hello world foo bar baz qux quux quuz quuuz quuuuz", makeV(0.8, ["widget"]), 0.15)).toBe(false));
  it("respects custom minDensity — low threshold passes", () =>
    expect(hasSufficientDomainContent("widget hello world foo bar baz qux quux quuz quuuz quuuuz", makeV(0.8, ["widget"]), 0.05)).toBe(true));
});

describe("BOTANICAL_KEYWORDS", () => {
  it("is a non-empty string array", () => {
    expect(Array.isArray(BOTANICAL_KEYWORDS)).toBe(true);
    expect(BOTANICAL_KEYWORDS.length).toBeGreaterThan(10);
  });
  it("contains known botanical terms", () => {
    const lower = BOTANICAL_KEYWORDS.map((k) => k.toLowerCase());
    expect(lower.some((k) => ["fern", "soil", "seed", "garden"].some((t) => k.includes(t)))).toBe(true);
  });
});

describe("FILLER_WORDS", () => {
  it("is a non-empty string array", () => {
    expect(Array.isArray(FILLER_WORDS)).toBe(true);
    expect(FILLER_WORDS.length).toBeGreaterThan(0);
  });
  it("includes common speech fillers", () => {
    expect(FILLER_WORDS).toContain("um");
    expect(FILLER_WORDS).toContain("like");
  });
});

describe("SPONSOR_PATTERNS", () => {
  it("is a non-empty RegExp array", () => {
    expect(SPONSOR_PATTERNS.length).toBeGreaterThan(0);
    expect(SPONSOR_PATTERNS[0]).toBeInstanceOf(RegExp);
  });
  it("matches typical sponsor text", () => {
    expect(SPONSOR_PATTERNS.some((p) => p.test("This video is sponsored by TechCorp"))).toBe(true);
    expect(SPONSOR_PATTERNS.some((p) => p.test("Follow me on instagram for more"))).toBe(true);
  });
});

describe("INTRO_OUTRO_PATTERNS", () => {
  it("is a non-empty RegExp array", () => {
    expect(INTRO_OUTRO_PATTERNS.length).toBeGreaterThan(0);
    expect(INTRO_OUTRO_PATTERNS[0]).toBeInstanceOf(RegExp);
  });
  it("matches typical intro and outro text", () => {
    expect(INTRO_OUTRO_PATTERNS.some((p) => p.test("Hey everyone welcome back to my channel"))).toBe(true);
    expect(INTRO_OUTRO_PATTERNS.some((p) => p.test("Thanks for watching see you next time"))).toBe(true);
  });
});
