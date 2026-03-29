/**
 * Unit tests for VarietyHintProvider — genus hint lookups, prompt formatting,
 * genera extraction from text, and in-memory cache behaviour.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getVarietyHintsForGenus,
  getVarietyHintsForGenera,
  formatVarietyHintsForPrompt,
  extractPotentialGeneraFromText,
  clearVarietyHintsCache,
} from "../../ner/variety-hint-provider.js";
import { createPlantDictionary } from "../../ner/plant-dictionary.js";
import { SAMPLE_PLANT_ENTRIES } from "../fixtures/sample-plant-dictionary.js";

const dict = createPlantDictionary(SAMPLE_PLANT_ENTRIES);

beforeEach(() => {
  clearVarietyHintsCache();
});

// ---------------------------------------------------------------------------
// getVarietyHintsForGenus
// ---------------------------------------------------------------------------

describe("getVarietyHintsForGenus", () => {
  it("returns empty array for empty genus string", () => {
    expect(getVarietyHintsForGenus("", dict)).toHaveLength(0);
  });

  it("returns hints for known genus with variety entries", () => {
    const hints = getVarietyHintsForGenus("Helenium", dict);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints[0]).toMatchObject({
      genus: "Helenium",
      variety: expect.any(String),
      source: "plant_dictionary",
      confidence: 0.9,
    });
  });

  it("returns empty array for unknown genus", () => {
    expect(getVarietyHintsForGenus("Nonexistus", dict)).toHaveLength(0);
  });

  it("hints are sorted by usage count descending when confidence is equal", () => {
    const hints = getVarietyHintsForGenus("Echinacea", dict);
    if (hints.length >= 2) {
      for (let i = 1; i < hints.length; i++) {
        expect(hints[i - 1]!.usageCount ?? 0).toBeGreaterThanOrEqual(
          hints[i]!.usageCount ?? 0,
        );
      }
    }
  });

  it("returns cached results on second call (same object reference)", () => {
    const first = getVarietyHintsForGenus("Rudbeckia", dict);
    const second = getVarietyHintsForGenus("Rudbeckia", dict);
    expect(first).toBe(second);
  });

  it("cache is cleared between tests (no cross-test bleed)", () => {
    const hints = getVarietyHintsForGenus("Helenium", dict);
    clearVarietyHintsCache("helenium");
    // After clear, calling again should return a new array (not the same ref)
    const hintsAfter = getVarietyHintsForGenus("Helenium", dict);
    expect(hintsAfter).not.toBe(hints);
    expect(hintsAfter).toHaveLength(hints.length);
  });
});

// ---------------------------------------------------------------------------
// getVarietyHintsForGenera
// ---------------------------------------------------------------------------

describe("getVarietyHintsForGenera", () => {
  it("returns a map with entries for genera that have varieties", () => {
    const result = getVarietyHintsForGenera(["Helenium", "Rudbeckia"], dict);
    expect(result.size).toBeGreaterThan(0);
  });

  it("omits genera with no variety matches", () => {
    const result = getVarietyHintsForGenera(["Nonexistus"], dict);
    expect(result.size).toBe(0);
  });

  it("handles empty genera array", () => {
    expect(getVarietyHintsForGenera([], dict).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatVarietyHintsForPrompt
// ---------------------------------------------------------------------------

describe("formatVarietyHintsForPrompt", () => {
  it("returns empty string for empty map", () => {
    expect(formatVarietyHintsForPrompt(new Map())).toBe("");
  });

  it("includes header and genus label for non-empty map", () => {
    const map = new Map([
      [
        "Helenium",
        [{ genus: "Helenium", variety: "Sahin's Early Flowerer", source: "plant_dictionary" as const, confidence: 0.9 }],
      ],
    ]);
    const output = formatVarietyHintsForPrompt(map);
    expect(output).toContain("Known varieties");
    expect(output).toContain("Helenium");
    expect(output).toContain("Sahin's Early Flowerer");
  });

  it("caps hints at 10 per genus", () => {
    const manyHints = Array.from({ length: 15 }, (_, i) => ({
      genus: "TestGenus",
      variety: `Variety${i}`,
      source: "plant_dictionary" as const,
      confidence: 0.9,
    }));
    const map = new Map([["TestGenus", manyHints]]);
    const output = formatVarietyHintsForPrompt(map);
    // At most 10 varieties should appear
    const varietyMatches = output.match(/Variety\d+/g) ?? [];
    expect(varietyMatches.length).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// extractPotentialGeneraFromText
// ---------------------------------------------------------------------------

describe("extractPotentialGeneraFromText", () => {
  it("extracts Latin botanical pattern (Genus species)", () => {
    const result = extractPotentialGeneraFromText(
      "We planted Lavandula angustifolia along the border",
    );
    expect(result).toContain("Lavandula");
  });

  it("detects common genera by name match", () => {
    const result = extractPotentialGeneraFromText(
      "The Echinacea is looking great this year",
    );
    expect(result).toContain("Echinacea");
  });

  it("returns empty array for plain prose with no genera", () => {
    const result = extractPotentialGeneraFromText(
      "we bought some tomatoes and potatoes at the market",
    );
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    expect(extractPotentialGeneraFromText("")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// clearVarietyHintsCache
// ---------------------------------------------------------------------------

describe("clearVarietyHintsCache", () => {
  it("clears a specific genus from cache", () => {
    getVarietyHintsForGenus("Rudbeckia", dict); // populate cache
    clearVarietyHintsCache("rudbeckia");
    // Next call should be a fresh fetch (no error — just re-populates)
    const hints = getVarietyHintsForGenus("Rudbeckia", dict);
    expect(hints.length).toBeGreaterThan(0);
  });

  it("clears all cache entries when no argument provided", () => {
    getVarietyHintsForGenus("Rudbeckia", dict);
    getVarietyHintsForGenus("Helenium", dict);
    clearVarietyHintsCache();
    // Both should re-fetch without errors
    expect(getVarietyHintsForGenus("Rudbeckia", dict).length).toBeGreaterThan(0);
    expect(getVarietyHintsForGenus("Helenium", dict).length).toBeGreaterThan(0);
  });
});
