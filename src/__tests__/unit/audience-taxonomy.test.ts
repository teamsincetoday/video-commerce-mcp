/**
 * Unit tests for audience taxonomy scoring.
 *
 * Tests:
 * - Single segment intent detection
 * - Full transcript intent analysis
 * - High-value segment extraction
 * - Edge cases (empty input, no matches)
 */

import { describe, it, expect } from "vitest";
import {
  detectIntentInSegment,
  analyzeTranscriptIntent,
  getHighValueSegments,
  GARDENING_INTENT_TAXONOMY,
} from "../../intelligence/audience-taxonomy.js";
import { AUTUMN_BORDER_TRANSCRIPT_SEGMENTS } from "../fixtures/sample-transcript.js";

describe("Audience Taxonomy", () => {
  describe("GARDENING_INTENT_TAXONOMY", () => {
    it("defines exactly 7 intent archetypes", () => {
      const keys = Object.keys(GARDENING_INTENT_TAXONOMY);
      expect(keys).toHaveLength(7);
      expect(keys).toContain("seasonal_action");
      expect(keys).toContain("learning_mastery");
      expect(keys).toContain("product_purchase");
      expect(keys).toContain("aspirational_lifestyle");
      expect(keys).toContain("problem_solving");
      expect(keys).toContain("community_sharing");
      expect(keys).toContain("eco_regenerative");
    });

    it("has product_purchase with highest weight (1.0)", () => {
      expect(GARDENING_INTENT_TAXONOMY.product_purchase!.weight).toBe(1.0);
    });

    it("has each archetype with required fields", () => {
      for (const [_key, intent] of Object.entries(GARDENING_INTENT_TAXONOMY)) {
        expect(intent.name).toBeDefined();
        expect(intent.examplePhrases.length).toBeGreaterThan(0);
        expect(intent.ctaSuggestions.length).toBeGreaterThan(0);
        expect(intent.dominantEmotions.length).toBeGreaterThan(0);
        expect(intent.weight).toBeGreaterThan(0);
        expect(intent.weight).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("detectIntentInSegment", () => {
    it("detects seasonal_action intent from seasonal phrases", () => {
      const results = detectIntentInSegment(
        "Now's the time to plant these before the frost. Get your beds ready for spring.",
        "01:00",
      );
      expect(results.length).toBeGreaterThan(0);
      const seasonalIntent = results.find(
        (r) => r.intent === "Seasonal Action",
      );
      expect(seasonalIntent).toBeDefined();
      expect(seasonalIntent!.matchedPhrases.length).toBeGreaterThan(0);
    });

    it("detects product_purchase intent from commercial phrases", () => {
      const results = detectIntentInSegment(
        "Check the description below for links to all the products. You can buy online and I use affiliate links.",
        "02:00",
      );
      const purchaseIntent = results.find(
        (r) => r.intent === "Product Purchase",
      );
      expect(purchaseIntent).toBeDefined();
    });

    it("detects problem_solving intent from issue phrases", () => {
      const results = detectIntentInSegment(
        "If your leaves turn yellow, it's a sign of overwatering. Here's how to fix the problem with aphids.",
        "01:30",
      );
      const problemIntent = results.find(
        (r) => r.intent === "Problem Solving",
      );
      expect(problemIntent).toBeDefined();
      expect(problemIntent!.matchedPhrases.length).toBeGreaterThan(0);
    });

    it("detects eco_regenerative intent from sustainability phrases", () => {
      const results = detectIntentInSegment(
        "I'm using peat free compost and organic fertilizer to be more sustainable.",
        "01:10",
      );
      const ecoIntent = results.find(
        (r) => r.intent === "Eco & Regenerative",
      );
      expect(ecoIntent).toBeDefined();
    });

    it("returns empty array for segments with no intent matches", () => {
      const results = detectIntentInSegment(
        "The weather today is quite pleasant and the sky is blue.",
        "00:30",
      );
      expect(results).toHaveLength(0);
    });

    it("sorts results by commercial value (highest first)", () => {
      const results = detectIntentInSegment(
        "Now's the time to plant these and you can buy them online. Use this technique step by step.",
        "01:00",
      );
      for (let i = 1; i < results.length; i++) {
        expect(results[i]!.commercialValue).toBeLessThanOrEqual(
          results[i - 1]!.commercialValue,
        );
      }
    });

    it("includes recommended CTA and dominant emotion", () => {
      const results = detectIntentInSegment(
        "Now's the time to plant these before the frost.",
        "01:00",
      );
      const intent = results[0];
      if (intent) {
        expect(intent.recommendedCTA).toBeDefined();
        expect(intent.dominantEmotion).toBeDefined();
      }
    });
  });

  describe("analyzeTranscriptIntent", () => {
    it("analyzes full transcript and returns summary", () => {
      const segments = AUTUMN_BORDER_TRANSCRIPT_SEGMENTS.map((s) => ({
        timestamp: s.timestamp,
        text: s.text,
      }));

      const analysis = analyzeTranscriptIntent(segments);

      expect(analysis.detections.length).toBeGreaterThan(0);
      expect(analysis.summary.topIntent).toBeDefined();
      expect(analysis.summary.totalCommercialValue).toBeGreaterThan(0);
      expect(analysis.summary.avgCommercialValue).toBeGreaterThan(0);
    });

    it("includes intent distribution in summary", () => {
      const segments = AUTUMN_BORDER_TRANSCRIPT_SEGMENTS.map((s) => ({
        timestamp: s.timestamp,
        text: s.text,
      }));

      const analysis = analyzeTranscriptIntent(segments);
      const distribution = analysis.summary.intentDistribution;

      // The autumn border transcript should trigger at least one intent
      expect(Object.keys(distribution).length).toBeGreaterThan(0);

      // Each intent in the distribution should have count and scores
      for (const dist of Object.values(distribution)) {
        expect(dist.count).toBeGreaterThan(0);
        expect(dist.avgScore).toBeGreaterThan(0);
      }
    });

    it("returns empty results for empty input", () => {
      const analysis = analyzeTranscriptIntent([]);
      expect(analysis.detections).toHaveLength(0);
      expect(analysis.summary.topIntent).toBe("");
      expect(analysis.summary.totalCommercialValue).toBe(0);
    });
  });

  describe("getHighValueSegments", () => {
    it("returns top N segments by commercial value", () => {
      const segments = AUTUMN_BORDER_TRANSCRIPT_SEGMENTS.map((s) => ({
        timestamp: s.timestamp,
        text: s.text,
      }));

      const analysis = analyzeTranscriptIntent(segments);
      const topSegments = getHighValueSegments(analysis.detections, 3);

      expect(topSegments.length).toBeLessThanOrEqual(3);

      // Verify sorted by commercial value descending
      for (let i = 1; i < topSegments.length; i++) {
        expect(topSegments[i]!.commercialValue).toBeLessThanOrEqual(
          topSegments[i - 1]!.commercialValue,
        );
      }
    });

    it("handles empty detections", () => {
      const topSegments = getHighValueSegments([]);
      expect(topSegments).toHaveLength(0);
    });
  });
});
