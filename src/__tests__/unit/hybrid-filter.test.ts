/** Unit tests: HybridRelevanceFilter keyword-only path, stats, hybrid routing, factory. */
import { describe, it, expect } from "vitest";
import { HybridRelevanceFilter, createHybridFilter } from "../../market-intelligence/hybrid-filter.js";
import type { AIClient } from "../../types.js";

const kw = () => new HybridRelevanceFilter(undefined, { aiMode: "keyword-only" });
const ai = (): AIClient => ({ complete: async () => ({ content: JSON.stringify({
  isRelevant: true, relevanceScore: 55, reason: "mock",
  verticals: { supportsPlants: true, supportsSeeds: false, supportsTools: false,
    supportsMaterials: false, supportsBooks: false, supportsMedia: false,
    supportsCourses: false, supportsEvents: false, supportsGardenShops: false },
}), tokensUsed: 50 }) });

describe("analyzeKeywordRelevance scoring", () => {
  it("0 matches → score=0 isRelevant=false empty matchedKeywords", async () => {
    const r = await kw().analyzeRelevance("widget supply", "software");
    expect(r.relevanceScore).toBe(0); expect(r.isRelevant).toBe(false);
    expect(r.matchedKeywords).toHaveLength(0);
  });
  it("1 match → score=40 isRelevant=false", async () => {
    const r = await kw().analyzeRelevance("fern products", "");
    expect(r.relevanceScore).toBe(40); expect(r.isRelevant).toBe(false);
  });
  it("2 matches in 2 categories → score=60 isRelevant=true", async () => {
    // fern(plants) + spade(tools) = 2 kw, 2 cats, no bonus
    const r = await kw().analyzeRelevance("fern spade", "");
    expect(r.relevanceScore).toBe(60); expect(r.isRelevant).toBe(true);
  });
  it("3 matches same category → score=75 (no bonus)", async () => {
    const r = await kw().analyzeRelevance("fern orchid palm", "");
    expect(r.relevanceScore).toBe(75);
  });
  it("5+ matches → score=90", async () => {
    const r = await kw().analyzeRelevance("fern orchid palm tulip rose", "");
    expect(r.relevanceScore).toBe(90);
  });
  it("3+ categories → +10 bonus applied (75→85)", async () => {
    // fern(plants) + spade(tools) + mulch(materials) = 3 cats
    const r = await kw().analyzeRelevance("fern spade mulch", "");
    expect(r.relevanceScore).toBe(85);
  });
  it("verticals flags reflect matched categories", async () => {
    const r = await kw().analyzeRelevance("tulip spade", "");
    expect(r.verticals.supportsPlants).toBe(true); expect(r.verticals.supportsTools).toBe(true);
    expect(r.verticals.supportsSeeds).toBe(false);
  });
  it("categoryMatches includes all default category keys", async () => {
    const r = await kw().analyzeRelevance("garden", "");
    expect("plants" in r.categoryMatches).toBe(true);
    expect("general" in r.categoryMatches).toBe(true);
  });
  it("custom verticalKeywords override default gardening map", async () => {
    const f = new HybridRelevanceFilter(undefined,
      { aiMode: "keyword-only", verticalKeywords: { tech: ["laptop", "keyboard"] } });
    const r = await f.analyzeRelevance("laptop keyboard", "");
    expect(r.isRelevant).toBe(true);
    expect(r.verticals.supportsPlants).toBe(false);
  });
});

describe("stats and hybrid routing", () => {
  it("keyword-only: tracks keywordOnly correctly", async () => {
    const f = kw(); await f.analyzeRelevance("garden", ""); await f.analyzeRelevance("widget", "");
    const s = f.getStats();
    expect(s.totalProcessed).toBe(2); expect(s.keywordOnly).toBe(2);
    expect(s.aiCalls).toBe(0); expect(s.aiCallPercentage).toBe("0.0%");
  });
  it("resetStats clears all counters", async () => {
    const f = kw(); await f.analyzeRelevance("garden", ""); f.resetStats();
    expect(f.getStats().totalProcessed).toBe(0); expect(f.getStats().costSaved).toBe(0);
  });
  it("hybrid: high-confidence (≥80) skips AI", async () => {
    const f = new HybridRelevanceFilter(ai(), { aiMode: "hybrid" });
    await f.analyzeRelevance("fern orchid palm tulip rose climber", ""); // score 90
    expect(f.getStats().aiCalls).toBe(0); expect(f.getStats().keywordOnly).toBe(1);
  });
  it("hybrid: low-confidence (≤20) skips AI", async () => {
    const f = new HybridRelevanceFilter(ai(), { aiMode: "hybrid" });
    await f.analyzeRelevance("tech gadgets software", ""); // score 0
    expect(f.getStats().aiCalls).toBe(0); expect(f.getStats().keywordOnly).toBe(1);
  });
  it("no aiClient → always keyword-only in hybrid mode", async () => {
    const f = new HybridRelevanceFilter(undefined, { aiMode: "hybrid" });
    await f.analyzeRelevance("garden fern", "");
    expect(f.getStats().aiCalls).toBe(0);
  });
});

describe("createHybridFilter — factory", () => {
  it("all three presets return valid HybridRelevanceFilter instances", () => {
    for (const p of ["balanced", "aggressive-cost-saving", "quality-first"] as const)
      expect(createHybridFilter(undefined, p)).toBeInstanceOf(HybridRelevanceFilter);
  });
  it("custom verticalKeywords passed through factory", async () => {
    const f = createHybridFilter(undefined, "balanced", undefined, { tech: ["laptop"] });
    const r = await f.analyzeRelevance("laptop deal", "");
    expect(r.matchedKeywords).toContain("laptop");
  });
});
