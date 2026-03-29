/**
 * Unit tests for PlantDictionary — lookup, search, and size methods
 * across Latin name, common name, synonym, and genus indices.
 */

import { describe, it, expect, beforeAll } from "vitest";
import type { PlantDictionary } from "../../types.js";
import { createPlantDictionary, createEmptyDictionary } from "../../ner/plant-dictionary.js";
import { SAMPLE_PLANT_ENTRIES } from "../fixtures/sample-plant-dictionary.js";

describe("PlantDictionary", () => {
  let dict: PlantDictionary;

  beforeAll(() => {
    dict = createPlantDictionary(SAMPLE_PLANT_ENTRIES);
  });

  it("size() returns correct entry count", () => {
    expect(dict.size()).toBe(SAMPLE_PLANT_ENTRIES.length);
  });

  it("getAll() returns all entries", () => {
    expect(dict.getAll()).toHaveLength(SAMPLE_PLANT_ENTRIES.length);
  });

  describe("findByLatinName", () => {
    it("finds entry by exact Latin name", () => {
      expect(dict.findByLatinName("Helenium autumnale")?.latinName).toBe("Helenium autumnale");
    });

    it("is case-insensitive", () => {
      expect(dict.findByLatinName("LAVANDULA ANGUSTIFOLIA")?.latinName).toBe("Lavandula angustifolia");
    });

    it("returns undefined for unknown Latin name", () => {
      expect(dict.findByLatinName("Fake species novum")).toBeUndefined();
    });
  });

  describe("findByName", () => {
    it("finds by Latin name", () => {
      expect(dict.findByName("Rudbeckia fulgida")?.latinName).toBe("Rudbeckia fulgida");
    });

    it("finds by common name", () => {
      expect(dict.findByName("English Lavender")?.latinName).toBe("Lavandula angustifolia");
    });

    it("finds by synonym", () => {
      expect(dict.findByName("Lavandula officinalis")?.latinName).toBe("Lavandula angustifolia");
    });

    it("returns undefined for unknown name", () => {
      expect(dict.findByName("Toyota Corolla")).toBeUndefined();
    });
  });

  describe("findByCommonName", () => {
    it("returns entries matching common name", () => {
      const results = dict.findByCommonName("Sneezeweed");
      expect(results).toHaveLength(1);
      expect(results[0]?.latinName).toBe("Helenium autumnale");
    });

    it("returns empty array for unknown common name", () => {
      expect(dict.findByCommonName("Invisible Plant")).toHaveLength(0);
    });
  });

  describe("findByGenus", () => {
    it("returns all plants of the specified genus", () => {
      const results = dict.findByGenus("Echinacea");
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((e) => e.genus === "Echinacea")).toBe(true);
    });

    it("returns empty array for unknown genus", () => {
      expect(dict.findByGenus("Ficus")).toHaveLength(0);
    });
  });

  describe("search", () => {
    it("matches partial Latin name", () => {
      expect(dict.search("Miscanthus").some((e) => e.latinName === "Miscanthus sinensis")).toBe(true);
    });

    it("matches partial common name across multiple entries", () => {
      expect(dict.search("Coneflower").length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("createEmptyDictionary", () => {
    it("size() is 0 and getAll() is empty", () => {
      const empty = createEmptyDictionary();
      expect(empty.size()).toBe(0);
      expect(empty.getAll()).toHaveLength(0);
    });
  });
});
