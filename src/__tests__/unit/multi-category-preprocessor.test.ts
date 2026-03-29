import { describe, it, expect, beforeAll } from "vitest";
import { MultiCategoryPreprocessor } from "../../transcript/multi-category-preprocessor.js";

describe("MultiCategoryPreprocessor", () => {
  let preprocessor: MultiCategoryPreprocessor;

  beforeAll(async () => {
    preprocessor = new MultiCategoryPreprocessor();
    await preprocessor.initialize();
  });

  describe("detectCategories", () => {
    it("returns empty array for empty transcript", () => {
      expect(preprocessor.detectCategories("")).toEqual([]);
    });

    it("returns empty when fewer than 3 keywords match in any category", () => {
      // Only 2 TOOL keywords — below threshold of 3
      expect(preprocessor.detectCategories("spade trowel")).toEqual([]);
    });

    it("detects TOOL when exactly 3 keywords present", () => {
      const result = preprocessor.detectCategories("spade fork trowel");
      expect(result).toContain("TOOL");
    });

    it("detects PLANT when 3+ keywords present", () => {
      const result = preprocessor.detectCategories("lavender rose tulip");
      expect(result).toContain("PLANT");
    });

    it("detects MATERIAL when 3+ keywords present", () => {
      const result = preprocessor.detectCategories("compost mulch fertilizer");
      expect(result).toContain("MATERIAL");
    });

    it("detects SEED when 3+ keywords present", () => {
      const result = preprocessor.detectCategories("seed packet germination sowing");
      expect(result).toContain("SEED");
    });

    it("detects STRUCTURE when 3+ keywords present", () => {
      const result = preprocessor.detectCategories("greenhouse planter cold frame container");
      expect(result).toContain("STRUCTURE");
    });

    it("detects BOOK when 3+ keywords present", () => {
      const result = preprocessor.detectCategories("gardening book guide reference manual");
      expect(result).toContain("BOOK");
    });

    it("detects multiple categories simultaneously", () => {
      const transcript =
        "spade fork trowel lavender rose tulip compost mulch fertilizer";
      const result = preprocessor.detectCategories(transcript);
      expect(result).toContain("TOOL");
      expect(result).toContain("PLANT");
      expect(result).toContain("MATERIAL");
    });

    it("is case-insensitive", () => {
      const result = preprocessor.detectCategories("SPADE FORK TROWEL");
      expect(result).toContain("TOOL");
    });

    it("handles mixed case", () => {
      const result = preprocessor.detectCategories("Compost Mulch Fertilizer Soil");
      expect(result).toContain("MATERIAL");
    });

    it("returns no duplicate categories", () => {
      const result = preprocessor.detectCategories("spade fork trowel");
      expect(result).toHaveLength(new Set(result).size);
    });

    it("does not detect TOOL when only 2 keywords match", () => {
      const result = preprocessor.detectCategories("spade trowel");
      expect(result).not.toContain("TOOL");
    });

    it("returns empty array for unrelated text", () => {
      const result = preprocessor.detectCategories("hello world the weather is nice today");
      expect(result).toHaveLength(0);
    });

    it("returns an array (not null or undefined)", () => {
      const result = preprocessor.detectCategories("random text");
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
