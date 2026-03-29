import { describe, it, expect } from "vitest";
import {
  COMMERCE_KEYWORDS,
  ALL_COMMERCE_KEYWORDS,
} from "../../transcript/multi-category-preprocessor.js";

const EXPECTED_CATEGORIES = [
  "PLANT", "TOOL", "MATERIAL", "STRUCTURE", "SEED",
  "BOOK", "COURSE", "EVENT", "SERVICE", "OTHER",
] as const;

describe("COMMERCE_KEYWORDS", () => {
  it("has all 10 commerce categories", () => {
    const keys = Object.keys(COMMERCE_KEYWORDS);
    expect(keys).toHaveLength(10);
    for (const cat of EXPECTED_CATEGORIES) expect(keys).toContain(cat);
  });

  it("each category is a non-empty array with no empty strings", () => {
    for (const cat of EXPECTED_CATEGORIES) {
      expect(COMMERCE_KEYWORDS[cat].length).toBeGreaterThan(0);
      for (const kw of COMMERCE_KEYWORDS[cat]) expect(kw.length).toBeGreaterThan(0);
    }
  });

  it("PLANT has 50+ keywords including core genera", () => {
    expect(COMMERCE_KEYWORDS.PLANT.length).toBeGreaterThanOrEqual(50);
    expect(COMMERCE_KEYWORDS.PLANT).toContain("lavender");
    expect(COMMERCE_KEYWORDS.PLANT).toContain("tomato");
    expect(COMMERCE_KEYWORDS.PLANT).toContain("rose");
  });

  it("TOOL has 40+ keywords including hand tools", () => {
    expect(COMMERCE_KEYWORDS.TOOL.length).toBeGreaterThanOrEqual(40);
    expect(COMMERCE_KEYWORDS.TOOL).toContain("spade");
    expect(COMMERCE_KEYWORDS.TOOL).toContain("trowel");
    expect(COMMERCE_KEYWORDS.TOOL).toContain("pruners");
  });

  it("MATERIAL contains soil amendments and fertilizers", () => {
    expect(COMMERCE_KEYWORDS.MATERIAL).toContain("compost");
    expect(COMMERCE_KEYWORDS.MATERIAL).toContain("fertilizer");
    expect(COMMERCE_KEYWORDS.MATERIAL).toContain("mulch");
  });

  it("SEED contains seed and bulb terms", () => {
    expect(COMMERCE_KEYWORDS.SEED).toContain("seed");
    expect(COMMERCE_KEYWORDS.SEED).toContain("bulb");
  });

  it("BOOK contains reference material terms", () => {
    expect(COMMERCE_KEYWORDS.BOOK).toContain("book");
    expect(COMMERCE_KEYWORDS.BOOK).toContain("guide");
  });

  it("COURSE contains learning terms", () => {
    expect(COMMERCE_KEYWORDS.COURSE).toContain("course");
    expect(COMMERCE_KEYWORDS.COURSE).toContain("workshop");
  });

  it("EVENT contains show and festival terms", () => {
    expect(COMMERCE_KEYWORDS.EVENT).toContain("show");
    expect(COMMERCE_KEYWORDS.EVENT).toContain("festival");
  });

  it("SERVICE contains design and landscape terms", () => {
    expect(COMMERCE_KEYWORDS.SERVICE).toContain("design");
    expect(COMMERCE_KEYWORDS.SERVICE).toContain("landscaping");
  });

  it("OTHER contains catchall terms", () => {
    expect(COMMERCE_KEYWORDS.OTHER).toContain("product");
    expect(COMMERCE_KEYWORDS.OTHER).toContain("kit");
  });
});

describe("ALL_COMMERCE_KEYWORDS", () => {
  it("is a flat array with length equal to sum of categories", () => {
    const expected = Object.values(COMMERCE_KEYWORDS)
      .reduce((sum, arr) => sum + arr.length, 0);
    expect(ALL_COMMERCE_KEYWORDS).toHaveLength(expected);
  });

  it("contains keywords from multiple categories", () => {
    expect(ALL_COMMERCE_KEYWORDS).toContain("lavender");  // PLANT
    expect(ALL_COMMERCE_KEYWORDS).toContain("spade");     // TOOL
    expect(ALL_COMMERCE_KEYWORDS).toContain("compost");   // MATERIAL
    expect(ALL_COMMERCE_KEYWORDS).toContain("seed");      // SEED
    expect(ALL_COMMERCE_KEYWORDS).toContain("book");      // BOOK
  });

  it("has no empty strings", () => {
    for (const kw of ALL_COMMERCE_KEYWORDS) expect(kw.length).toBeGreaterThan(0);
  });
});
