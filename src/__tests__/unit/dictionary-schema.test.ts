/**
 * Unit tests for dictionary-schema.ts
 * Covers: plantEntryToDomainEntry (all field mappings + null handling),
 *         DOMAIN_DICTIONARY_JSON_SCHEMA (structure checks).
 */

import { describe, it, expect } from "vitest";
import {
  plantEntryToDomainEntry,
  DOMAIN_DICTIONARY_JSON_SCHEMA,
} from "../../verticals/dictionary-schema.js";

type PlantInput = Parameters<typeof plantEntryToDomainEntry>[0];

const base: PlantInput = {
  latinName: "Lavandula angustifolia",
  commonNames: ["Lavender", "English Lavender"],
  synonyms: ["Lavandula officinalis"],
  genus: "Lavandula",
  species: "angustifolia",
  variety: null,
  tradeNames: [],
  taxonomyLevel: "species",
  usageCount: 42,
  ambiguityScore: 0.1,
};

describe("plantEntryToDomainEntry", () => {
  it("sets canonicalName = latinName", () => { expect(plantEntryToDomainEntry(base).canonicalName).toBe("Lavandula angustifolia"); });
  it("sets category to PLANT always", () => { expect(plantEntryToDomainEntry(base).category).toBe("PLANT"); });
  it("sets formalName = latinName", () => { expect(plantEntryToDomainEntry(base).formalName).toBe("Lavandula angustifolia"); });
  it("maps commonNames → alternativeNames", () => { expect(plantEntryToDomainEntry(base).alternativeNames).toEqual(["Lavender", "English Lavender"]); });
  it("passes synonyms through", () => { expect(plantEntryToDomainEntry(base).synonyms).toEqual(["Lavandula officinalis"]); });
  it("maps genus when present", () => { expect(plantEntryToDomainEntry(base).genus).toBe("Lavandula"); });
  it("genus → undefined when null", () => { expect(plantEntryToDomainEntry({ ...base, genus: null }).genus).toBeUndefined(); });
  it("maps species when present", () => { expect(plantEntryToDomainEntry(base).species).toBe("angustifolia"); });
  it("species → undefined when null", () => { expect(plantEntryToDomainEntry({ ...base, species: null }).species).toBeUndefined(); });
  it("wraps variety in array when present", () => { expect(plantEntryToDomainEntry({ ...base, variety: "Hidcote" }).variants).toEqual(["Hidcote"]); });
  it("variants → undefined when variety null", () => { expect(plantEntryToDomainEntry(base).variants).toBeUndefined(); });
  it("maps tradeNames when non-empty", () => { expect(plantEntryToDomainEntry({ ...base, tradeNames: ["Proven Winners"] }).tradeNames).toEqual(["Proven Winners"]); });
  it("tradeNames → undefined when empty array", () => { expect(plantEntryToDomainEntry(base).tradeNames).toBeUndefined(); });
  it("maps taxonomyLevel when present", () => { expect(plantEntryToDomainEntry(base).taxonomyLevel).toBe("species"); });
  it("taxonomyLevel → undefined when null", () => { expect(plantEntryToDomainEntry({ ...base, taxonomyLevel: null }).taxonomyLevel).toBeUndefined(); });
  it("maps usageCount", () => { expect(plantEntryToDomainEntry(base).usageCount).toBe(42); });
  it("maps ambiguityScore when present", () => { expect(plantEntryToDomainEntry(base).ambiguityScore).toBe(0.1); });
  it("ambiguityScore → undefined when null", () => { expect(plantEntryToDomainEntry({ ...base, ambiguityScore: null }).ambiguityScore).toBeUndefined(); });
});

describe("DOMAIN_DICTIONARY_JSON_SCHEMA", () => {
  it("is an array schema", () => { expect(DOMAIN_DICTIONARY_JSON_SCHEMA.type).toBe("array"); });
  it("items require canonicalName", () => { expect(DOMAIN_DICTIONARY_JSON_SCHEMA.items.required).toContain("canonicalName"); });
  it("items require category", () => { expect(DOMAIN_DICTIONARY_JSON_SCHEMA.items.required).toContain("category"); });
});
