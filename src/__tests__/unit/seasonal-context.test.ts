import { describe, it, expect } from "vitest";
import {
  extractSeasonalContext,
  getSeasonSummary,
  getClimateSummary,
  isRelevantForSeason,
} from "../../intelligence/seasonal-context.js";

describe("extractSeasonalContext", () => {
  it("detects spring from transcript", () => {
    const ctx = extractSeasonalContext("This is a spring gardening video.");
    expect(ctx.seasons).toContain("spring");
    expect(ctx.confidence).toBeGreaterThan(0.5);
  });
  it("detects January month", () => {
    const ctx = extractSeasonalContext("I planted seeds in January.");
    expect(ctx.months).toContain(1);
  });
  it("detects frost and marks temperate", () => {
    const ctx = extractSeasonalContext("Watch out for frost damage tonight.");
    expect(ctx.weather.frostMentioned).toBe(true);
    expect(ctx.timing.isTemperate).toBe(true);
  });
  it("detects UK region and northern hemisphere", () => {
    const ctx = extractSeasonalContext("Gardening tips for UK spring growers.");
    expect(ctx.climate.regions).toContain("UK");
    expect(ctx.climate.hemisphere).toBe("northern");
  });
  it("sets isSeasonSpecific for single season", () => {
    const ctx = extractSeasonalContext("Summer is the best time to plant.");
    expect(ctx.timing.isSeasonSpecific).toBe(true);
  });
  it("sets isYearRound for year-round phrases", () => {
    const ctx = extractSeasonalContext("This works year-round in any garden.");
    expect(ctx.timing.isYearRound).toBe(true);
  });
  it("returns base confidence 0.5 for empty transcript", () => {
    const ctx = extractSeasonalContext("");
    expect(ctx.confidence).toBe(0.5);
    expect(ctx.seasons).toHaveLength(0);
  });
});

describe("getSeasonSummary", () => {
  it("returns Year-round for year-round content", () => {
    const ctx = extractSeasonalContext("Works year-round for gardeners.");
    expect(getSeasonSummary(ctx)).toBe("Year-round");
  });
  it("returns Not season-specific when no seasons or months detected", () => {
    const ctx = extractSeasonalContext("");
    expect(getSeasonSummary(ctx)).toBe("Not season-specific");
  });
  it("capitalises detected season name", () => {
    const ctx = extractSeasonalContext("Perfect for spring planting season.");
    expect(getSeasonSummary(ctx)).toContain("Spring");
  });
});

describe("getClimateSummary", () => {
  it("returns Not region-specific when no regions", () => {
    const ctx = extractSeasonalContext("");
    expect(getClimateSummary(ctx)).toBe("Not region-specific");
  });
  it("includes hemisphere when explicitly detected", () => {
    const ctx = extractSeasonalContext(
      "Tips for UK gardeners in the northern hemisphere.",
    );
    expect(getClimateSummary(ctx)).toContain("northern hemisphere");
  });
});

describe("isRelevantForSeason", () => {
  it("always relevant for year-round content", () => {
    const ctx = extractSeasonalContext("This works year-round.");
    expect(isRelevantForSeason(ctx, 6, "northern").relevant).toBe(true);
  });
  it("relevant when user month matches transcript month", () => {
    const ctx = extractSeasonalContext("March is perfect for seed starting.");
    ctx.timing.isSeasonSpecific = true;
    expect(isRelevantForSeason(ctx, 3, "northern").relevant).toBe(true);
  });
  it("irrelevant when content hemisphere differs from user hemisphere", () => {
    const ctx = extractSeasonalContext(
      "For southern hemisphere summer gardening.",
    );
    const result = isRelevantForSeason(ctx, 6, "northern");
    expect(result.relevant).toBe(false);
    expect(result.reason).toContain("hemisphere");
  });
  it("irrelevant when content season does not match user current season", () => {
    const ctx = extractSeasonalContext(
      "Winter pruning techniques for dormant plants.",
    );
    // June = northern summer; content is winter → mismatch
    const result = isRelevantForSeason(ctx, 6, "northern");
    expect(result.relevant).toBe(false);
  });
});
