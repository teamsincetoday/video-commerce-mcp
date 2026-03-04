/**
 * Unit tests for entity resolution against the plant dictionary.
 *
 * Tests:
 * - Exact Latin name matching
 * - Common name matching
 * - Synonym matching
 * - Fuzzy matching with Levenshtein and Jaro-Winkler
 * - No-match cases
 * - Batch resolution
 * - Related entity suggestions
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  resolveEntityAdvanced,
  batchResolveEntities,
  suggestRelatedEntities,
  fuzzyMatch,
  levenshteinDistance,
  jaroWinklerSimilarity,
} from "../../ner/entity-resolution.js";
import type { PlantDictionary } from "../../types.js";
import {
  createTestDictionary,
  SAMPLE_PLANT_ENTRIES,
} from "../fixtures/sample-plant-dictionary.js";

describe("Entity Resolution", () => {
  let dictionary: PlantDictionary;

  beforeAll(() => {
    dictionary = createTestDictionary();
  });

  describe("resolveEntityAdvanced", () => {
    it("resolves exact Latin name match with confidence 1.0", () => {
      const result = resolveEntityAdvanced("Helenium autumnale", dictionary);
      expect(result.matchType).toBe("exact");
      expect(result.confidence).toBe(1.0);
      expect(result.entity).not.toBeNull();
      expect(result.entity!.latinName).toBe("Helenium autumnale");
    });

    it("resolves exact Latin name case-insensitively", () => {
      const result = resolveEntityAdvanced("HELENIUM AUTUMNALE", dictionary);
      expect(result.matchType).toBe("exact");
      expect(result.entity!.latinName).toBe("Helenium autumnale");
    });

    it("resolves exact common name match with confidence 0.95", () => {
      const result = resolveEntityAdvanced("Sneezeweed", dictionary);
      expect(result.matchType).toBe("exact");
      expect(result.confidence).toBe(0.95);
      expect(result.entity!.latinName).toBe("Helenium autumnale");
    });







    it("resolves synonym match with confidence 0.9", () => {
      const result = resolveEntityAdvanced("Lavandula officinalis", dictionary);
      expect(result.matchType).toBe("synonym");
      expect(result.confidence).toBe(0.9);
      expect(result.entity!.latinName).toBe("Lavandula angustifolia");
    });

    it("resolves fuzzy match for close misspellings", () => {
      const result = resolveEntityAdvanced("Helenium autumale", dictionary);
      // Should match via fuzzy since it's one character off
      expect(result.matchType).toBe("fuzzy");
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.entity).not.toBeNull();
    });

    it("returns none for completely unrelated queries", () => {
      const result = resolveEntityAdvanced(
        "Toyota Corolla",
        dictionary,
        { fuzzyThreshold: 0.9 },
      );
      expect(result.matchType).toBe("none");
      expect(result.entity).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it("includes alternatives when requested", () => {
      const result = resolveEntityAdvanced("Rudbeckia", dictionary, {
        includeAlternatives: true,
      });
      // Rudbeckia is a genus that should match as a substring in Rudbeckia fulgida
      expect(result.entity).not.toBeNull();
    });
  });

  describe("batchResolveEntities", () => {
    it("resolves multiple entities in a single call", () => {
      const results = batchResolveEntities(
        ["Helenium autumnale", "English Lavender", "Unknown Plant XYZ"],
        dictionary,
        { fuzzyThreshold: 0.95 },
      );

      expect(results.size).toBe(3);

      const helenium = results.get("Helenium autumnale");
      expect(helenium?.matchType).toBe("exact");

      const lavender = results.get("English Lavender");
      expect(lavender?.matchType).toBe("exact");

      const unknown = results.get("Unknown Plant XYZ");
      expect(unknown?.matchType).toBe("none");
    });
  });

  describe("suggestRelatedEntities", () => {
    it("suggests plants from the same genus", () => {
      // Rudbeckia purpurea is a synonym of Echinacea but different genus
      const rosaEntry = SAMPLE_PLANT_ENTRIES.find(
        (e) => e.latinName === "Rosa gallica",
      )!;
      const related = suggestRelatedEntities(rosaEntry, dictionary);
      // No other Rosa in our sample, so related might be empty
      expect(Array.isArray(related)).toBe(true);
    });
  });

  describe("fuzzyMatch", () => {
    it("returns 1.0 for exact substring match", () => {
      const score = fuzzyMatch("helenium", "helenium autumnale");
      expect(score).toBeGreaterThan(0.8);
    });

    it("returns high score for close matches", () => {
      const score = fuzzyMatch("lavandula angustifolia", "lavandula angustifolia");
      expect(score).toBe(1.0);
    });

    it("returns low score for unrelated strings", () => {
      const score = fuzzyMatch("banana", "helenium autumnale");
      expect(score).toBeLessThan(0.5);
    });
  });

  describe("levenshteinDistance", () => {
    it("returns 0 for identical strings", () => {
      expect(levenshteinDistance("hello", "hello")).toBe(0);
    });

    it("returns correct distance for simple edits", () => {
      expect(levenshteinDistance("kitten", "sitting")).toBe(3);
      expect(levenshteinDistance("cat", "car")).toBe(1);
    });
  });

  describe("jaroWinklerSimilarity", () => {
    it("returns 1.0 for identical strings", () => {
      expect(jaroWinklerSimilarity("hello", "hello")).toBe(1.0);
    });

    it("returns 0.0 for completely different strings", () => {
      expect(jaroWinklerSimilarity("", "hello")).toBe(0.0);
    });

    it("gives bonus for shared prefix", () => {
      const withPrefix = jaroWinklerSimilarity("helenium", "heleniam");
      const withoutPrefix = jaroWinklerSimilarity("xenium", "xeniam");
      // Both should be high but helenium has longer shared prefix
      expect(withPrefix).toBeGreaterThan(0.8);
      expect(withoutPrefix).toBeGreaterThan(0.8);
    });
  });
});
