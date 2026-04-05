/**
 * Unit tests for enhanced-ner.ts → enhanceExtractedEntities
 */
import { describe, it, expect } from "vitest";
import { enhanceExtractedEntities } from "../../ner/enhanced-ner.js";
import type { Entity } from "../../types.js";
import { createPlantDictionary, createEmptyDictionary } from "../../ner/plant-dictionary.js";
import { SAMPLE_PLANT_ENTRIES } from "../fixtures/sample-plant-dictionary.js";

const dict = createPlantDictionary(SAMPLE_PLANT_ENTRIES);
const emptyDict = createEmptyDictionary();

function mkEntity(o: Partial<Entity> = {}): Entity {
  return { entity: "Rosa", metadata: {}, timestamp: "00:01:00", context: "pruning", confidence: 0.9, ...o };
}

const BASE = { rawEntities: [] as Entity[], transcript: "", videoTitle: "Test" };

describe("enhanceExtractedEntities", () => {
  it("empty input → no entities, zero metrics", async () => {
    const r = await enhanceExtractedEntities(BASE, { dictionary: emptyDict });
    expect(r.entities).toHaveLength(0);
    expect(r.metrics.totalEntities).toBe(0);
    expect(r.metrics.avgConfidence).toBe(0);
  });
  it("resolves via findByLatinName", async () => {
    const e = mkEntity({ metadata: { latinName: "Helenium autumnale" } });
    const r = await enhanceExtractedEntities({ ...BASE, rawEntities: [e] }, { dictionary: dict });
    expect(r.entities[0].plantId).toBe("helenium_autumnale");
  });
  it("falls back to findByName using entity string (common name)", async () => {
    const e = mkEntity({ entity: "Sneezeweed", metadata: {} });
    const r = await enhanceExtractedEntities({ ...BASE, rawEntities: [e] }, { dictionary: dict });
    expect(r.entities[0].plantId).toBe("helenium_autumnale");
  });
  it("taxonomyLevel=genus increments genusOnlyCount", async () => {
    const e = mkEntity({ metadata: { latinName: "Prunus", taxonomyLevel: "genus" } });
    const r = await enhanceExtractedEntities({ ...BASE, rawEntities: [e] }, { dictionary: emptyDict });
    expect(r.metrics.genusOnlyCount).toBe(1);
  });
  it("single-word latinName without space → genus-only detection", async () => {
    const e = mkEntity({ metadata: { latinName: "Acer" } });
    const r = await enhanceExtractedEntities({ ...BASE, rawEntities: [e] }, { dictionary: emptyDict });
    expect(r.metrics.genusOnlyCount).toBe(1);
  });
  it("high-confidence (0.8) unresolved entity → derived plantId", async () => {
    const e = mkEntity({ confidence: 0.8, metadata: { latinName: "Quercus robur" } });
    const r = await enhanceExtractedEntities({ ...BASE, rawEntities: [e] }, { dictionary: emptyDict });
    expect(r.entities[0].plantId).toBe("quercus_robur");
  });
  it("low-confidence (0.5) unresolved entity → plantId undefined", async () => {
    const e = mkEntity({ confidence: 0.5, metadata: { latinName: "Quercus robur" } });
    const r = await enhanceExtractedEntities({ ...BASE, rawEntities: [e] }, { dictionary: emptyDict });
    expect(r.entities[0].plantId).toBeUndefined();
  });
  it("avgConfidence = mean across multiple entities", async () => {
    const ents = [mkEntity({ confidence: 0.6 }), mkEntity({ confidence: 0.8 })];
    const r = await enhanceExtractedEntities({ ...BASE, rawEntities: ents }, { dictionary: emptyDict });
    expect(r.metrics.avgConfidence).toBeCloseTo(0.7, 5);
  });
  it("complexity metadata → cognitiveComplexity/practicalComplexity/emotionalComplexity", async () => {
    const e = mkEntity({ metadata: { complexity: { cognitive: 3, practical: 2, emotional: 1 } } });
    const r = await enhanceExtractedEntities({ ...BASE, rawEntities: [e] }, { dictionary: emptyDict });
    expect(r.entities[0].cognitiveComplexity).toBe(3);
    expect(r.entities[0].practicalComplexity).toBe(2);
    expect(r.entities[0].emotionalComplexity).toBe(1);
  });
  it("no aiClient → disambiguated stays false for genus-only entity", async () => {
    const e = mkEntity({ metadata: { latinName: "Prunus", taxonomyLevel: "genus" } });
    const r = await enhanceExtractedEntities({ ...BASE, rawEntities: [e] }, { dictionary: emptyDict });
    expect(r.entities[0].disambiguated).toBe(false);
  });
});
