/**
 * Unit tests for the response formatter (Layer 1 tools).
 *
 * Tests output shapes for all 6 Layer 1 tools:
 * - analyze_video
 * - get_commercial_entities
 * - get_monetization_opportunities
 * - get_audience_insights
 * - discover_content_gaps
 * - batch_analyze
 */

import { describe, it, expect } from "vitest";
import {
  formatAnalyzeVideoResponse,
  formatCommercialEntitiesResponse,
  formatMonetizationResponse,
  formatAudienceInsightsResponse,
  formatContentGapsResponse,
  formatBatchAnalyzeResponse,
  type AnalysisResult,
  type ContentGap,
} from "../../response-formatter.js";
import { ANALYSIS_ENTITIES } from "../fixtures/sample-entities.js";

/**
 * Create a mock AnalysisResult with all fields populated.
 */
function createMockAnalysisResult(
  overrides?: Partial<AnalysisResult>,
): AnalysisResult {
  return {
    videoId: "abc123",
    title: "Autumn Border Planting Masterclass",
    channel: "Garden Answer",
    durationSeconds: 1247,
    language: "en",
    analysisTimestamp: "2026-03-03T12:00:00Z",
    analysisDepth: "standard",
    entities: ANALYSIS_ENTITIES,
    audienceIntent: {
      detections: [
        {
          intent: "Seasonal Action",
          score: 0.85,
          timestamp: "00:59",
          segment: "Now's the time to get these in the ground before the frost.",
          matchedPhrases: ["now's the time to", "before the frost"],
          dominantEmotion: "motivation",
          recommendedCTA: "Shop tools & supplies for this week's garden jobs",
          commercialValue: 0.765,
        },
        {
          intent: "Problem Solving",
          score: 0.7,
          timestamp: "01:27",
          segment: "If your leaves turn yellow on these plants",
          matchedPhrases: ["if your leaves turn yellow"],
          dominantEmotion: "frustration",
          recommendedCTA: "View quick fixes",
          commercialValue: 0.595,
        },
        {
          intent: "Product Purchase",
          score: 0.6,
          timestamp: "01:27",
          segment: "You can check the description below for links",
          matchedPhrases: ["check the description"],
          dominantEmotion: "trust",
          recommendedCTA: "Buy now",
          commercialValue: 0.6,
        },
      ],
      summary: {
        intentDistribution: {
          "Seasonal Action": { count: 1, totalScore: 0.85, avgScore: 0.85 },
          "Problem Solving": { count: 1, totalScore: 0.7, avgScore: 0.7 },
          "Product Purchase": { count: 1, totalScore: 0.6, avgScore: 0.6 },
        },
        topIntent: "Seasonal Action",
        totalCommercialValue: 1.96,
        avgCommercialValue: 0.653,
        emotionDistribution: {
          motivation: 1,
          frustration: 1,
          trust: 1,
        },
      },
    },
    quality: {
      editorialTier: "FEATURED",
      overallScore: 78,
      contentDepth: 80,
      visualQuality: 85,
      botanicalLiteracy: 92,
      productionValue: 75,
      standfirst: "A masterclass in autumn border planting with bold perennials",
    },
    skills: {
      primarySkill: {
        name: "autumn_border_planting",
        displayName: "Autumn Border Planting",
        skillLevel: "intermediate",
        confidence: 0.85,
      },
      extractedSkills: [],
      objectives: [],
      quality: {
        overallScore: 82,
        structureScore: 75,
        clarityScore: 80,
        depthScore: 85,
      },
      sequencing: {
        prerequisiteSkills: ["soil_preparation", "perennial_basics"],
        nextSkillSuggestions: ["color_theory_planting", "winter_structure"],
        difficultyProgression: "gradual",
      },
    },
    seasonalContext: {
      timing: {
        isSeasonSpecific: true,
        isYearRound: false,
        detectedSeason: "autumn",
        detectedMonth: null,
      },
      confidence: 0.9,
      regions: ["UK", "temperate"],
      gardeningTasks: ["planting", "border design"],
    },
    categoryPotential: {
      categoryId: "autumn-perennials",
      overallPotential: 78,
      demandScore: 80,
      revenueScore: 70,
      growthScore: 75,
      competitionScore: 40,
      seasonalScore: 85,
      recommendedAction: "priority",
      reasoning: "Strong demand for autumn perennials content",
    },
    ...overrides,
  };
}

describe("Response Formatter — Layer 1 Tools", () => {
  describe("formatAnalyzeVideoResponse", () => {
    it("returns correct base fields", () => {
      const result = createMockAnalysisResult();
      const response = formatAnalyzeVideoResponse(result);

      expect(response.video_id).toBe("abc123");
      expect(response.title).toBe("Autumn Border Planting Masterclass");
      expect(response.channel).toBe("Garden Answer");
      expect(response.duration_seconds).toBe(1247);
      expect(response.language).toBe("en");
      expect(response.analysis_depth).toBe("standard");
    });

    it("calculates commercial_intent_score between 0-100", () => {
      const result = createMockAnalysisResult();
      const response = formatAnalyzeVideoResponse(result);

      expect(response.commercial_intent_score).toBeGreaterThan(0);
      expect(response.commercial_intent_score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(response.commercial_intent_score)).toBe(true);
    });

    it("formats entities with snake_case keys", () => {
      const result = createMockAnalysisResult();
      const response = formatAnalyzeVideoResponse(result);

      expect(response.entities).toBeDefined();
      expect(response.entities!.length).toBe(ANALYSIS_ENTITIES.length);

      const first = response.entities![0]!;
      expect(first.name).toBeDefined();
      expect(first.category).toBeDefined();
      expect(first.confidence).toBeDefined();
      expect(first.is_shoppable).toBeDefined();
      expect(first.mentions).toBeInstanceOf(Array);
      expect(first.mentions[0]!.timestamp_seconds).toBeDefined();

      // Categories should be lowercase
      for (const entity of response.entities!) {
        expect(entity.category).toBe(entity.category.toLowerCase());
      }
    });

    it("includes monetization_potential when present", () => {
      const result = createMockAnalysisResult();
      const response = formatAnalyzeVideoResponse(result);

      const entityWithMonetization = response.entities!.find(
        (e) => e.monetization_potential,
      );
      expect(entityWithMonetization).toBeDefined();
      expect(
        entityWithMonetization!.monetization_potential!.affiliate_score,
      ).toBeGreaterThan(0);
    });

    it("includes audience_intent with deduplicated intents", () => {
      const result = createMockAnalysisResult();
      const response = formatAnalyzeVideoResponse(result);

      expect(response.audience_intent).toBeDefined();
      expect(response.audience_intent!.dominant_intent).toBe(
        "Seasonal Action",
      );
      expect(response.audience_intent!.intents.length).toBeGreaterThan(0);

      for (const intent of response.audience_intent!.intents) {
        expect(intent.type).toBeDefined();
        expect(intent.score).toBeGreaterThan(0);
        expect(intent.emotion).toBeDefined();
        expect(intent.commercial_value).toBeGreaterThan(0);
        expect(intent.recommended_cta).toBeDefined();
      }
    });

    it("includes quality dimension", () => {
      const result = createMockAnalysisResult();
      const response = formatAnalyzeVideoResponse(result);

      expect(response.quality).toBeDefined();
      expect(response.quality!.editorial_tier).toBe("FEATURED");
      expect(response.quality!.teaching_score).toBe(80);
      expect(response.quality!.visual_quality).toBe(85);
      expect(response.quality!.botanical_literacy).toBe(92);
      expect(response.quality!.standfirst).toBeDefined();
    });

    it("includes skills dimension", () => {
      const result = createMockAnalysisResult();
      const response = formatAnalyzeVideoResponse(result);

      expect(response.skills).toBeDefined();
      expect(response.skills!.primary).toBeDefined();
      expect(response.skills!.primary!.name).toBe("autumn_border_planting");
      expect(response.skills!.primary!.level).toBe("intermediate");
      expect(response.skills!.prerequisites).toContain("soil_preparation");
      expect(response.skills!.next_skills).toContain("color_theory_planting");
    });

    it("includes market_position dimension", () => {
      const result = createMockAnalysisResult();
      const response = formatAnalyzeVideoResponse(result);

      expect(response.market_position).toBeDefined();
      expect(response.market_position!.trend_direction).toBe("rising");
      expect(response.market_position!.competition_level).toBeGreaterThanOrEqual(0);
      expect(response.market_position!.competition_level).toBeLessThanOrEqual(1);
    });

    it("handles missing optional fields gracefully", () => {
      const result = createMockAnalysisResult({
        entities: undefined,
        audienceIntent: undefined,
        quality: undefined,
        skills: undefined,
        seasonalContext: undefined,
        categoryPotential: undefined,
      });
      const response = formatAnalyzeVideoResponse(result);

      expect(response.video_id).toBe("abc123");
      expect(response.entities).toBeUndefined();
      expect(response.audience_intent).toBeUndefined();
      expect(response.quality).toBeUndefined();
      expect(response.skills).toBeUndefined();
      expect(response.market_position).toBeUndefined();
      expect(response.commercial_intent_score).toBe(0);
    });
  });

  describe("formatCommercialEntitiesResponse", () => {
    it("returns entities with correct shape", () => {
      const result = createMockAnalysisResult();
      const response = formatCommercialEntitiesResponse(result);

      expect(response.video_id).toBe("abc123");
      expect(response.total_count).toBe(ANALYSIS_ENTITIES.length);
      expect(response.entities.length).toBe(ANALYSIS_ENTITIES.length);
      expect(response.categories_found.length).toBeGreaterThan(0);

      // Entities should NOT include monetization_potential
      for (const entity of response.entities) {
        expect(entity.name).toBeDefined();
        expect(entity.category).toBeDefined();
        expect(entity.is_shoppable).toBeDefined();
        expect((entity as Record<string, unknown>).monetization_potential).toBeUndefined();
      }
    });

    it("filters by category when specified", () => {
      const result = createMockAnalysisResult();
      const response = formatCommercialEntitiesResponse(result, ["PLANT"]);

      // Should only return PLANT entities
      for (const entity of response.entities) {
        expect(entity.category).toBe("plant");
      }
      expect(response.total_count).toBeLessThan(ANALYSIS_ENTITIES.length);
    });

    it("handles empty entities", () => {
      const result = createMockAnalysisResult({ entities: [] });
      const response = formatCommercialEntitiesResponse(result);

      expect(response.total_count).toBe(0);
      expect(response.entities).toHaveLength(0);
      expect(response.categories_found).toHaveLength(0);
    });
  });

  describe("formatMonetizationResponse", () => {
    it("returns monetization opportunities sorted by score", () => {
      const result = createMockAnalysisResult();
      const response = formatMonetizationResponse(result);

      expect(response.video_id).toBe("abc123");
      expect(response.opportunities.length).toBeGreaterThan(0);

      // Should be sorted descending by score
      for (let i = 1; i < response.opportunities.length; i++) {
        expect(response.opportunities[i]!.score).toBeLessThanOrEqual(
          response.opportunities[i - 1]!.score,
        );
      }
    });

    it("includes affiliate_commerce strategy when shoppable entities exist", () => {
      const result = createMockAnalysisResult();
      const response = formatMonetizationResponse(result);

      const affiliate = response.opportunities.find(
        (o) => o.strategy === "affiliate_commerce",
      );
      expect(affiliate).toBeDefined();
      expect(affiliate!.entities_applicable).toBeGreaterThan(0);
      expect(affiliate!.recommended_products).toBeDefined();
      expect(affiliate!.reasoning).toBeDefined();
    });

    it("includes course_creation strategy when teaching quality is sufficient", () => {
      const result = createMockAnalysisResult();
      const response = formatMonetizationResponse(result);

      const course = response.opportunities.find(
        (o) => o.strategy === "course_creation",
      );
      expect(course).toBeDefined();
      expect(course!.skill_foundation).toBe("autumn_border_planting");
    });

    it("includes sponsored_content strategy when quality is high", () => {
      const result = createMockAnalysisResult();
      const response = formatMonetizationResponse(result);

      const sponsored = response.opportunities.find(
        (o) => o.strategy === "sponsored_content",
      );
      expect(sponsored).toBeDefined();
      expect(sponsored!.reasoning).toContain("78/100");
    });

    it("returns no opportunities when no data", () => {
      const result = createMockAnalysisResult({
        entities: [],
        skills: undefined,
        quality: undefined,
      });
      const response = formatMonetizationResponse(result);
      expect(response.opportunities).toHaveLength(0);
    });
  });

  describe("formatAudienceInsightsResponse", () => {
    it("returns deduplicated intents", () => {
      const result = createMockAnalysisResult();
      const response = formatAudienceInsightsResponse(result);

      expect(response.video_id).toBe("abc123");
      expect(response.dominant_intent).toBe("Seasonal Action");
      expect(response.intents.length).toBeGreaterThan(0);

      // Check no duplicate intent types
      const intentTypes = response.intents.map((i) => i.type);
      expect(new Set(intentTypes).size).toBe(intentTypes.length);
    });

    it("returns null dominant_intent when no audience data", () => {
      const result = createMockAnalysisResult({
        audienceIntent: undefined,
      });
      const response = formatAudienceInsightsResponse(result);

      expect(response.dominant_intent).toBeNull();
      expect(response.intents).toHaveLength(0);
    });
  });

  describe("formatContentGapsResponse", () => {
    it("formats content gaps with correct shape", () => {
      const gaps: ContentGap[] = [
        {
          topic: "helenium variety comparison",
          demandScore: 0.78,
          competition: 0.23,
          opportunityScore: 0.85,
          estimatedMonthlySearches: 2400,
          trend: "rising",
          recommendation: "invest_now",
          monetizationAngles: ["affiliate", "sponsored"],
        },
        {
          topic: "autumn container planting",
          demandScore: 0.6,
          competition: 0.35,
          opportunityScore: 0.65,
          trend: "stable",
          recommendation: "test_small",
        },
        {
          topic: "bedding plant alternatives",
          demandScore: 0.3,
          competition: 0.7,
          opportunityScore: 0.2,
          trend: "declining",
          recommendation: "skip",
        },
      ];

      const response = formatContentGapsResponse(gaps);

      expect(response.gaps).toHaveLength(3);
      expect(response.emerging_topics).toContain("helenium variety comparison");
      expect(response.declining_topics).toContain("bedding plant alternatives");

      const firstGap = response.gaps[0]!;
      expect(firstGap.demand_score).toBe(0.78);
      expect(firstGap.competition).toBe(0.23);
      expect(firstGap.opportunity_score).toBe(0.85);
      expect(firstGap.trend).toBe("rising");
      expect(firstGap.recommendation).toBe("invest_now");
      expect(firstGap.monetization_angles).toContain("affiliate");
    });

    it("handles empty gaps", () => {
      const response = formatContentGapsResponse([]);
      expect(response.gaps).toHaveLength(0);
      expect(response.emerging_topics).toHaveLength(0);
      expect(response.declining_topics).toHaveLength(0);
    });
  });

  describe("formatBatchAnalyzeResponse", () => {
    it("formats multiple analyses", () => {
      const results = [
        createMockAnalysisResult({ videoId: "video1" }),
        createMockAnalysisResult({ videoId: "video2" }),
      ];

      const response = formatBatchAnalyzeResponse(results, false);

      expect(response.total).toBe(2);
      expect(response.analyses).toHaveLength(2);
      expect(response.analyses[0]!.video_id).toBe("video1");
      expect(response.analyses[1]!.video_id).toBe("video2");
      expect(response.comparison).toBeUndefined();
    });

    it("includes cross-video comparison when compare=true", () => {
      const results = [
        createMockAnalysisResult({ videoId: "video1" }),
        createMockAnalysisResult({ videoId: "video2" }),
      ];

      const response = formatBatchAnalyzeResponse(results, true);

      expect(response.comparison).toBeDefined();
      expect(response.comparison!.shared_entities).toBeDefined();
      expect(response.comparison!.complementary_topics).toBeDefined();
      expect(response.comparison!.combined_audience_map).toBeDefined();

      // Both videos have the same entities, so all should be shared
      expect(response.comparison!.shared_entities.length).toBeGreaterThan(0);
      for (const shared of response.comparison!.shared_entities) {
        expect(shared.video_count).toBe(2);
      }
    });

    it("does not compare when only 1 video", () => {
      const results = [createMockAnalysisResult({ videoId: "video1" })];
      const response = formatBatchAnalyzeResponse(results, true);

      expect(response.comparison).toBeUndefined();
    });
  });
});
