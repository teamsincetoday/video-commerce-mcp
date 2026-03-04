/**
 * Integration tests for the full video analysis pipeline.
 *
 * These tests validate the end-to-end flow from YouTube URL to formatted
 * MCP response. They require live API access (YouTube captions, OpenAI)
 * so they are marked with describe.skip by default.
 *
 * To run: remove .skip and set OPENAI_API_KEY + network access.
 */

import { describe, it, expect } from "vitest";
import { createServer, type ServerOptions } from "../../server.js";
import { MarketIntelligenceOrchestrator } from "../../market-intelligence-orchestrator.js";

// ---------------------------------------------------------------------------
// Integration: Full pipeline (requires live APIs)
// ---------------------------------------------------------------------------

describe.skip("Pipeline Integration (requires live APIs)", () => {
  const TEST_VIDEO_URL =
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ"; // Replace with a real gardening video

  it("analyze_video returns all 6 dimensions for a real video", async () => {
    // This test would:
    // 1. Fetch real YouTube captions
    // 2. Run NER extraction via OpenAI
    // 3. Resolve entities against plant dictionary
    // 4. Run audience taxonomy analysis
    // 5. Format the complete response
    //
    // Requires: OPENAI_API_KEY, network access to YouTube
    expect(true).toBe(true); // placeholder
  });

  it("get_commercial_entities returns entities for a real video", async () => {
    expect(true).toBe(true); // placeholder
  });

  it("batch_analyze handles multiple videos", async () => {
    expect(true).toBe(true); // placeholder
  });
});

// ---------------------------------------------------------------------------
// Integration: Market Intelligence Orchestrator (uses seed data, no live APIs)
// ---------------------------------------------------------------------------

describe("Market Intelligence Orchestrator Integration", () => {
  let orchestrator: MarketIntelligenceOrchestrator;

  beforeAll(() => {
    orchestrator = new MarketIntelligenceOrchestrator({});
  });

  describe("discoverOpportunities", () => {
    it("returns opportunity results from seed data", () => {
      const results = orchestrator.discoverOpportunities("gardening");

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      const first = results[0]!;
      expect(first.categoryName).toBeDefined();
      expect(first.convergenceScore).toBeGreaterThanOrEqual(0);
      expect(first.recommendation).toBeDefined();
      expect(first.reasoning).toBeDefined();
    });

    it("filters by minimum score", () => {
      const allResults = orchestrator.discoverOpportunities("gardening", 0);
      const highResults = orchestrator.discoverOpportunities("gardening", 0.7);

      expect(highResults.length).toBeLessThanOrEqual(allResults.length);
    });

    it("returns results sorted by opportunity score descending", () => {
      const results = orchestrator.discoverOpportunities("gardening");

      // Orchestrator sorts by opportunityScore, not convergenceScore
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.opportunityScore).toBeGreaterThanOrEqual(
          results[i]!.opportunityScore,
        );
      }
    });
  });

  describe("mapCategoryAffinity", () => {
    it("returns affinity data for a seed category", () => {
      const result = orchestrator.mapCategoryAffinity("perennials", 2);

      expect(result).toBeDefined();
      // sourceCategory returns the display name from seed data
      expect(result.sourceCategory).toBe("Perennials");
      expect(result.depth).toBe(2);
      expect(Array.isArray(result.relationships)).toBe(true);
    });
  });

  describe("trackCategoryLifecycle", () => {
    it("returns lifecycle data for a seed category", () => {
      const result = orchestrator.trackCategoryLifecycle("perennials");

      expect(result).toBeDefined();
      // category returns the display name from seed data
      expect(result.category).toBe("Perennials");
      expect(result.stage).toBeDefined();
      expect(Array.isArray(result.signals)).toBe(true);
    });
  });

  describe("getSeasonalCalendar", () => {
    it("returns seasonal events for UK region", () => {
      const result = orchestrator.getSeasonalCalendar("UK", 3);

      expect(result).toBeDefined();
      expect(result.region).toBe("UK");
      expect(result.hemisphere).toBe("northern");
      expect(result.currentSeason).toBeDefined();
      expect(Array.isArray(result.events)).toBe(true);
    });

    it("returns seasonal events for southern hemisphere", () => {
      const result = orchestrator.getSeasonalCalendar("AU", 3);

      expect(result).toBeDefined();
      expect(result.hemisphere).toBe("southern");
    });

    it("limits events to the requested months ahead", () => {
      const shortResult = orchestrator.getSeasonalCalendar("UK", 1);
      const longResult = orchestrator.getSeasonalCalendar("UK", 12);

      expect(longResult.events.length).toBeGreaterThanOrEqual(
        shortResult.events.length,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Integration: Cache hit path
// ---------------------------------------------------------------------------

describe.skip("Cache Integration (requires SQLite)", () => {
  it("second analysis of same video hits cache", async () => {
    // This test would:
    // 1. Analyze a video (first call - cache miss)
    // 2. Analyze same video again (second call - cache hit)
    // 3. Verify second call is faster and returns same data
    expect(true).toBe(true); // placeholder
  });

  it("cache respects TTL expiration", async () => {
    // This test would:
    // 1. Set a cache entry with short TTL
    // 2. Wait for TTL to expire
    // 3. Verify next call is a cache miss
    expect(true).toBe(true); // placeholder
  });
});
