import { describe, it, expect } from "vitest";
import { detectAmbiguousEntities } from "../../ner/entity-disambiguation.js";

describe("detectAmbiguousEntities", () => {
  it("returns empty array for empty input", () => {
    expect(detectAmbiguousEntities([])).toEqual([]);
  });

  it("flags entity with commonName but no latinName as ambiguous", () => {
    const result = detectAmbiguousEntities([
      { entity: "lavender", commonName: "Lavender", confidence: 0.8 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.entity).toBe("lavender");
    expect(result[0]!.reason).toContain("Common name only");
  });

  it("does not flag entity when latinName is provided", () => {
    const result = detectAmbiguousEntities([
      { entity: "lavandula", latinName: "Lavandula angustifolia", commonName: "Lavender", confidence: 0.9 },
    ]);
    expect(result).toHaveLength(0);
  });

  it("flags single-word entity with confidence below 0.7", () => {
    const result = detectAmbiguousEntities([
      { entity: "fern", confidence: 0.5 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toContain("Single word with low confidence");
  });

  it("does not flag single-word entity when confidence is exactly 0.7", () => {
    const result = detectAmbiguousEntities([
      { entity: "fern", confidence: 0.7 },
    ]);
    expect(result).toHaveLength(0);
  });

  it("flags known ambiguous term 'rose' without latinName", () => {
    const result = detectAmbiguousEntities([
      { entity: "rose", confidence: 0.9 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toContain("Known ambiguous common name");
  });

  it("does not flag 'lily' when latinName is provided", () => {
    const result = detectAmbiguousEntities([
      { entity: "lily", latinName: "Lilium candidum", confidence: 0.9 },
    ]);
    expect(result).toHaveLength(0);
  });

  it("flags substring match on known ambiguous term (garden sage → sage)", () => {
    const result = detectAmbiguousEntities([
      { entity: "garden sage", confidence: 0.9 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toContain("Known ambiguous common name");
  });

  it("does not flag multi-word entity with low confidence (single-word rule requires 1 word)", () => {
    const result = detectAmbiguousEntities([
      { entity: "english oak tree", confidence: 0.4 },
    ]);
    expect(result).toHaveLength(0);
  });

  it("flags both 'mint' and 'basil' as known ambiguous without latinName", () => {
    const result = detectAmbiguousEntities([
      { entity: "mint", confidence: 0.9 },
      { entity: "basil", confidence: 0.8 },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]!.reason).toContain("Known ambiguous common name");
    expect(result[1]!.reason).toContain("Known ambiguous common name");
  });

  it("returns only ambiguous entities from a mixed list", () => {
    const entities = [
      { entity: "Lavandula angustifolia", latinName: "Lavandula angustifolia", confidence: 0.95 },
      { entity: "rose", confidence: 0.8 },
      { entity: "fern", confidence: 0.5 },
    ];
    const result = detectAmbiguousEntities(entities);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.entity)).toContain("rose");
    expect(result.map((r) => r.entity)).toContain("fern");
  });
});
