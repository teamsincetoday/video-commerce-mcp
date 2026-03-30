import { describe, expect, it } from "vitest";
import {
  collectFeedback,
  buildRuntimeVertical,
  resolveVertical,
  getRegisteredVerticalKeywords,
} from "../../verticals/index.js";

describe("collectFeedback", () => {
  it("empty inputs: zero entity/commerce counts, no names", () => {
    const r = collectFeedback([], [], null);
    expect(r.entityCount).toBe(0);
    expect(r.avgConfidence).toBe(0);
    expect(r.commercialIntentScore).toBe(0);
    expect(r.shoppableEntityNames).toEqual([]);
  });

  it("counts entities, avgConfidence, and observedEntityCategories", () => {
    const r = collectFeedback([
      { name: "Rose", category: "plant", confidence: 0.9, isShoppable: true },
      { name: "Spade", category: "tool", confidence: 0.7, isShoppable: false },
    ], [], null);
    expect(r.entityCount).toBe(2);
    expect(r.avgConfidence).toBeCloseTo(0.8);
    expect(r.observedEntityCategories).toEqual({ plant: 1, tool: 1 });
  });

  it("shoppable filter: isShoppable AND confidence > 0.7 both required", () => {
    const r = collectFeedback([
      { name: "Keep", category: "plant", confidence: 0.8, isShoppable: true },
      { name: "DropConf", category: "plant", confidence: 0.65, isShoppable: true },
      { name: "DropFlag", category: "tool", confidence: 0.9, isShoppable: false },
    ], [], null);
    expect(r.shoppableEntityNames).toEqual(["Keep"]);
  });

  it("aggregates commerce items by category and collects names", () => {
    const r = collectFeedback([], [
      { name: "Secateurs", category: "tool", confidence: 0.9 },
      { name: "Compost", category: "material", confidence: 0.85 },
      { name: "Trowel", category: "tool", confidence: 0.8 },
    ], null);
    expect(r.commerceItemCount).toBe(3);
    expect(r.observedCommerceCategories).toEqual({ tool: 2, material: 1 });
    expect(r.commerceItemNames).toContain("Secateurs");
  });

  it("captures commercialIntentScore and deduplicates action categories", () => {
    const r = collectFeedback([], [], {
      commercialIntent: { score: 0.75 },
      actions: [{ category: "buy" }, { category: "research" }, { category: "buy" }],
    });
    expect(r.commercialIntentScore).toBe(0.75);
    expect(r.observedActionCategories).toEqual(["buy", "research"]);
  });
});

describe("buildRuntimeVertical", () => {
  it("id matches category; displayName defaults to '<category> Content'", () => {
    const v = buildRuntimeVertical("cooking", {});
    expect(v.id).toBe("cooking");
    expect(v.displayName).toBe("cooking Content");
  });

  it("uses provided displayName", () => {
    const v = buildRuntimeVertical("fitness", { displayName: "Fitness & Health" });
    expect(v.displayName).toBe("Fitness & Health");
  });

  it("filteringAggressiveness 0.3 with keywords, 0.1 without", () => {
    expect(buildRuntimeVertical("diy", { inclusionKeywords: ["hammer"] }).filteringAggressiveness).toBe(0.3);
    expect(buildRuntimeVertical("none", {}).filteringAggressiveness).toBe(0.1);
  });

  it("maps suggestedConfig.commerceCategories", () => {
    const v = buildRuntimeVertical("craft", {
      commerceCategories: [{ id: "SUPPLY", displayName: "Craft Supplies", keywords: ["yarn"] }],
    });
    expect(v.commerceCategories[0].keywords).toContain("yarn");
  });
});

describe("resolveVertical", () => {
  it("known id returns source=registered; unknown falls back to generic", () => {
    const known = resolveVertical("gardening");
    expect(known.source).toBe("registered");
    expect(known.config.id).toBe("gardening");
    const unknown = resolveVertical("totally-unknown-xyz-99");
    expect(unknown.source).toBe("generic");
    expect(unknown.config.id).toBe("generic");
  });
});
describe("getRegisteredVerticalKeywords", () => {
  it("includes gardening keywords and excludes generic", () => {
    const map = getRegisteredVerticalKeywords();
    expect(map.has("gardening")).toBe(true);
    expect(map.has("generic")).toBe(false);
    expect(map.get("gardening")!.length).toBeGreaterThan(10);
  });
});
