/**
 * Unit tests for MarketIntelligenceOrchestrator public non-async methods.
 */
import { describe, it, expect } from "vitest";
import {
  createMarketIntelligenceOrchestrator,
  MarketIntelligenceOrchestrator,
} from "../../market-intelligence-orchestrator.js";

describe("createMarketIntelligenceOrchestrator", () => {
  it("creates an instance", () => {
    expect(createMarketIntelligenceOrchestrator()).toBeInstanceOf(MarketIntelligenceOrchestrator);
  });
  it("accepts empty options", () => {
    expect(createMarketIntelligenceOrchestrator({})).toBeInstanceOf(MarketIntelligenceOrchestrator);
  });
});

describe("discoverOpportunities", () => {
  const orc = createMarketIntelligenceOrchestrator();
  it("returns results from default seed data", () => {
    expect(orc.discoverOpportunities("gardening").length).toBeGreaterThan(0);
  });
  it("results have required fields", () => {
    const [r] = orc.discoverOpportunities("gardening");
    expect(typeof r!.categoryName).toBe("string");
    expect(typeof r!.convergenceScore).toBe("number");
    expect(typeof r!.recommendation).toBe("string");
  });
  it("high minScore filters results", () => {
    const all = orc.discoverOpportunities("gardening");
    expect(orc.discoverOpportunities("gardening", 0.99).length).toBeLessThanOrEqual(all.length);
  });
  it("empty seedCategories falls back to default seed data", () => {
    const orc2 = createMarketIntelligenceOrchestrator({ seedCategories: [] });
    expect(orc2.discoverOpportunities("gardening").length).toBeGreaterThan(0);
  });
});

describe("mapCategoryAffinity", () => {
  const orc = createMarketIntelligenceOrchestrator();
  it("returns empty result for unknown category", () => {
    const r = orc.mapCategoryAffinity("unknown-zzz");
    expect(r.relationships).toHaveLength(0);
    expect(r.expansionPaths).toHaveLength(0);
    expect(r.sourceCategory).toBe("unknown-zzz");
  });
  it("returns relationships and depth for known category id", () => {
    const r = orc.mapCategoryAffinity("houseplants", 3);
    expect(Array.isArray(r.relationships)).toBe(true);
    expect(r.depth).toBe(3);
  });
  it("matches category by full display name", () => {
    const r = orc.mapCategoryAffinity("Houseplants & Indoor Growing");
    expect(r.sourceCategory).toBe("Houseplants & Indoor Growing");
    expect(Array.isArray(r.relationships)).toBe(true);
  });
});

describe("trackCategoryLifecycle", () => {
  const orc = createMarketIntelligenceOrchestrator();
  it("returns detected stage for unknown category", () => {
    const r = orc.trackCategoryLifecycle("nonexistent-xyz");
    expect(r.stage).toBe("detected");
    expect(r.convergenceScore).toBe(0);
    expect(r.nextStage).toBeNull();
    expect(r.weeksInCurrentStage).toBe(0);
  });
  it("returns promoted stage for houseplants seed data", () => {
    const r = orc.trackCategoryLifecycle("houseplants");
    expect(r.stage).toBe("promoted");
    expect(r.signals.length).toBeGreaterThan(0);
    expect(r.recommendedActions.length).toBeGreaterThan(0);
  });
  it("returns trend_validated stage for native-plants", () => {
    const r = orc.trackCategoryLifecycle("native-plants");
    expect(r.stage).toBe("trend_validated");
    expect(Array.isArray(r.signals)).toBe(true);
  });
});

describe("getSeasonalCalendar", () => {
  const orc = createMarketIntelligenceOrchestrator();
  it("returns northern hemisphere for UK", () => {
    const r = orc.getSeasonalCalendar("UK");
    expect(r.hemisphere).toBe("northern");
    expect(r.region).toBe("UK");
  });
  it("returns southern hemisphere for AU", () => {
    expect(orc.getSeasonalCalendar("AU").hemisphere).toBe("southern");
  });
  it("respects monthsAhead and returns valid season", () => {
    const r = orc.getSeasonalCalendar("GLOBAL", 6);
    expect(r.monthsAhead).toBe(6);
    expect(["spring", "summer", "autumn", "winter"]).toContain(r.currentSeason);
    expect(Array.isArray(r.events)).toBe(true);
    expect(Array.isArray(r.ethnobotanicalEvents)).toBe(true);
  });
});
