/**
 * Unit tests for the market intelligence response formatter (Layer 2 tools).
 *
 * Tests output shapes for all 6 Layer 2 tools:
 * - discover_opportunities
 * - scan_affiliate_programs
 * - assess_channel_authority
 * - map_category_affinity
 * - track_category_lifecycle
 * - get_seasonal_calendar
 */

import { describe, it, expect } from "vitest";
import {
  formatOpportunitiesResponse,
  formatAffiliateProgramsResponse,
  formatChannelAuthorityResponse,
  formatCategoryAffinityResponse,
  formatCategoryLifecycleResponse,
  formatSeasonalCalendarResponse,
  type OpportunityData,
  type AffiliateProgramData,
  type ChannelAuthorityData,
  type CategoryAffinityData,
  type CategoryLifecycleData,
  type SeasonalCalendarData,
} from "../../market-intelligence-formatter.js";
import type { ConvergenceSignals } from "../../market-intelligence/convergence-detector.js";

function createMockSignals(
  overrides?: Partial<ConvergenceSignals>,
): ConvergenceSignals {
  return {
    categoryId: "autumn-perennials",
    categoryName: "Autumn Perennials",
    demandScore: 75,
    commissionScore: 65,
    authorityScore: 55,
    competitionScore: 30,
    competitorCount: 15,
    contentVolume: 80,
    barrierToEntry: 40,
    convergenceScore: 50,
    trendDirection: "rising",
    velocityScore: 12,
    opportunityScore: 65,
    priority: "high",
    recommendation: "invest_now",
    estimatedRevenue: 500,
    estimatedCost: 300,
    roiEstimate: 1.7,
    timeToRevenue: 3,
    confidence: 0.85,
    calculatedAt: new Date(),
    ...overrides,
  };
}

describe("Market Intelligence Formatter -- Layer 2 Tools", () => {
  describe("formatOpportunitiesResponse", () => {
    it("formats opportunities with correct shape", () => {
      const data: OpportunityData[] = [
        { signals: createMockSignals(), vertical: "gardening" },
        {
          signals: createMockSignals({
            categoryName: "Spring Bulbs",
            convergenceScore: 30,
            recommendation: "test_small",
          }),
        },
      ];

      const response = formatOpportunitiesResponse(data, "gardening");

      expect(response.vertical).toBe("gardening");
      expect(response.analyzed_at).toBeDefined();
      expect(response.opportunities).toHaveLength(2);

      // Sorted by convergence_score descending
      expect(response.opportunities[0]!.convergence_score).toBeGreaterThanOrEqual(
        response.opportunities[1]!.convergence_score,
      );

      const first = response.opportunities[0]!;
      expect(first.category).toBe("Autumn Perennials");
      expect(first.convergence_score).toBeDefined();
      expect(first.recommendation).toBe("invest_now");
      expect(first.demand_score).toBeDefined();
      expect(first.commission_score).toBeDefined();
      expect(first.authority_score).toBeDefined();
      expect(first.competition_level).toBeDefined();
      expect(first.reasoning).toBeDefined();
      expect(first.reasoning.length).toBeGreaterThan(0);
    });

    it("handles empty opportunities", () => {
      const response = formatOpportunitiesResponse([]);
      expect(response.opportunities).toHaveLength(0);
      expect(response.vertical).toBe("gardening");
    });
  });

  describe("formatAffiliateProgramsResponse", () => {
    it("formats affiliate programs with correct shape", () => {
      const data: AffiliateProgramData = {
        programs: [
          {
            advertiserId: 123,
            advertiserName: "Garden Plants Direct",
            description: "UK plant nursery",
            url: "https://example.com",
            status: "active",
            commission: { min: 5, max: 12 },
            cookieDuration: 30,
            sector: "gardening",
            relevanceScore: 85,
          },
          {
            advertiserId: 456,
            advertiserName: "Green Tools Ltd",
            description: "Garden tools",
            url: "https://example2.com",
            status: "active",
            commission: { min: 3, max: 8 },
            cookieDuration: 14,
            sector: "tools",
            relevanceScore: 60,
          },
        ],
        category: "autumn perennials",
      };

      const response = formatAffiliateProgramsResponse(data);

      expect(response.category).toBe("autumn perennials");
      expect(response.total_found).toBe(2);
      expect(response.programs).toHaveLength(2);

      // Sorted by category_match_score descending
      expect(response.programs[0]!.category_match_score).toBeGreaterThanOrEqual(
        response.programs[1]!.category_match_score,
      );

      const first = response.programs[0]!;
      expect(first.program_name).toBe("Garden Plants Direct");
      expect(first.commission_rate).toBe("5-12%");
      expect(first.cookie_duration_days).toBe(30);
      expect(first.status).toBe("recommended");
    });

    it("handles empty programs", () => {
      const response = formatAffiliateProgramsResponse({
        programs: [],
        category: "test",
      });
      expect(response.total_found).toBe(0);
      expect(response.programs).toHaveLength(0);
    });
  });

  describe("formatChannelAuthorityResponse", () => {
    it("formats channel authority with 5 dimensions", () => {
      const data: ChannelAuthorityData = {
        channel: {
          channelId: "UCtest123",
          channelName: "Garden Answer",
          subscriberCount: 500000,
          videoCount: 200,
          yearsActive: 8,
        },
        vettingResult: {
          channelId: "ch-1",
          score: 78,
          confidence: 0.85,
          decision: "approved",
          criteriaResults: [
            { criterionId: "published_books", score: 60, confidence: 0.7, evidence: [], flags: [] },
            { criterionId: "editorial_vetting", score: 70, confidence: 0.8, evidence: [], flags: [] },
            { criterionId: "media_presence", score: 85, confidence: 0.9, evidence: [], flags: [] },
            { criterionId: "professional_credentials", score: 80, confidence: 0.85, evidence: [], flags: [] },
            { criterionId: "institutional_affiliation", score: 50, confidence: 0.6, evidence: [], flags: [] },
            { criterionId: "ethical_alignment", score: 75, confidence: 0.8, evidence: [], flags: [] },
            { criterionId: "production_quality", score: 90, confidence: 0.95, evidence: [], flags: [] },
          ],
          requiresHumanReview: false,
          humanReviewReasons: [],
          evaluatedAt: new Date(),
          cost: 0.0002,
        },
      };

      const response = formatChannelAuthorityResponse(data);

      expect(response.channel_id).toBe("UCtest123");
      expect(response.channel_name).toBe("Garden Answer");
      expect(response.overall_score).toBe(78);

      // Check all 5 dimensions exist
      expect(response.dimensions.reach).toBeDefined();
      expect(response.dimensions.engagement).toBeDefined();
      expect(response.dimensions.quality).toBeDefined();
      expect(response.dimensions.trust).toBeDefined();
      expect(response.dimensions.commercial).toBeDefined();

      // Reach derived from media_presence
      expect(response.dimensions.reach.score).toBe(85);
      expect(response.dimensions.reach.subscribers).toBe(500000);

      // Engagement derived from production_quality
      expect(response.dimensions.engagement.score).toBe(90);

      // Quality derived from editorial_vetting + published_books
      expect(response.dimensions.quality.score).toBe(65); // avg of 70 + 60

      // Trust derived from professional_credentials + institutional_affiliation
      expect(response.dimensions.trust.score).toBe(65); // avg of 80 + 50
      expect(response.dimensions.trust.verified).toBe(true);
      expect(response.dimensions.trust.years_active).toBe(8);

      // Commercial derived from ethical_alignment
      expect(response.dimensions.commercial.score).toBe(75);
      expect(response.dimensions.commercial.affiliate_ready).toBe(true);

      expect(response.recommendation).toContain("Approved");
    });
  });

  describe("formatCategoryAffinityResponse", () => {
    it("formats category affinities with relationship types", () => {
      const data: CategoryAffinityData = {
        category: "Autumn Perennials",
        affinities: [
          {
            relatedCategoryName: "Spring Perennials",
            result: {
              affinityScore: 0.85,
              keywordOverlap: 60,
              commerceOverlap: 70,
              audienceOverlap: 55,
              relationshipType: "sibling",
            },
          },
          {
            relatedCategoryName: "Garden Tools",
            result: {
              affinityScore: 0.45,
              keywordOverlap: 20,
              commerceOverlap: 30,
              audienceOverlap: 40,
              relationshipType: "adjacent",
            },
          },
          {
            relatedCategoryName: "Cooking Recipes",
            result: {
              affinityScore: 0.05,
              keywordOverlap: 2,
              commerceOverlap: 1,
              audienceOverlap: 5,
              relationshipType: "unrelated",
            },
          },
        ],
        expansionPaths: [
          { path: ["Autumn Perennials", "Spring Perennials", "Summer Annuals"], viabilityScore: 0.72 },
        ],
      };

      const response = formatCategoryAffinityResponse(data);

      expect(response.category).toBe("Autumn Perennials");
      // Unrelated should be filtered out
      expect(response.related_categories).toHaveLength(2);

      // Sorted by affinity descending
      expect(response.related_categories[0]!.affinity_score).toBeGreaterThanOrEqual(
        response.related_categories[1]!.affinity_score,
      );

      const first = response.related_categories[0]!;
      expect(first.name).toBe("Spring Perennials");
      expect(first.relationship_type).toBe("overlapping"); // sibling -> overlapping
      expect(first.shared_audience_pct).toBeGreaterThan(0);
      expect(first.cross_sell_potential).toBeGreaterThan(0);

      const second = response.related_categories[1]!;
      expect(second.relationship_type).toBe("adjacent");

      expect(response.expansion_paths).toHaveLength(1);
      expect(response.expansion_paths[0]!.path).toHaveLength(3);
    });
  });

  describe("formatCategoryLifecycleResponse", () => {
    it("maps internal stages to MCP-facing states", () => {
      const testCases: Array<{
        stage: CategoryLifecycleData["currentStage"];
        expected: string;
      }> = [
        { stage: "detected", expected: "emerging" },
        { stage: "trend_validated", expected: "emerging" },
        { stage: "keywords_learned", expected: "growing" },
        { stage: "ready_for_promotion", expected: "growing" },
        { stage: "promoted", expected: "mature" },
        { stage: "retired", expected: "declining" },
      ];

      for (const { stage, expected } of testCases) {
        const data: CategoryLifecycleData = {
          category: "Test Category",
          currentStage: stage,
          stageConfidence: 0.8,
          signals: [
            { signal: "Rising demand", direction: "positive", strength: 0.7 },
          ],
        };

        const response = formatCategoryLifecycleResponse(data);
        expect(response.current_state).toBe(expected);
      }
    });

    it("includes transition probability", () => {
      const data: CategoryLifecycleData = {
        category: "Autumn Perennials",
        currentStage: "keywords_learned",
        stageConfidence: 0.85,
        signals: [
          { signal: "Strong keyword growth", direction: "positive", strength: 0.8 },
          { signal: "Competition increasing", direction: "negative", strength: 0.4 },
        ],
        transition: {
          nextState: "mature",
          probability: 0.65,
          estimatedTimeframe: "6-10 weeks",
        },
      };

      const response = formatCategoryLifecycleResponse(data);

      expect(response.category).toBe("Autumn Perennials");
      expect(response.current_state).toBe("growing");
      expect(response.state_confidence).toBe(0.85);
      expect(response.signals).toHaveLength(2);
      expect(response.transition_probability.next_state).toBe("mature");
      expect(response.transition_probability.probability).toBe(0.65);
    });

    it("infers transition when not provided", () => {
      const data: CategoryLifecycleData = {
        category: "Test",
        currentStage: "detected",
        stageConfidence: 0.6,
        signals: [],
      };

      const response = formatCategoryLifecycleResponse(data);
      expect(response.transition_probability.next_state).toBe("growing");
      expect(response.transition_probability.probability).toBeGreaterThan(0);
    });
  });

  describe("formatSeasonalCalendarResponse", () => {
    it("formats seasonal calendar with events", () => {
      const data: SeasonalCalendarData = {
        region: "UK",
        currentSeason: "spring",
        events: [
          {
            template: {
              title: "Spring Planting Sale",
              description: "Get ready for spring",
              type: "seasonal",
              season: "spring",
              region: "UK",
              categories: ["Seeds", "Plants"],
              keywords: ["spring", "planting"],
              monthStart: 2,
              dayStart: 1,
              monthEnd: 4,
              dayEnd: 31,
              featured: true,
            },
            demandMultiplier: 1.8,
            commerceTip:
              "Peak buying season for seeds and bulbs. Promote starter kits.",
          },
          {
            template: {
              title: "Chelsea Flower Show Week",
              type: "seasonal",
              categories: ["Plants", "Garden Tools"],
              monthStart: 4,
              dayStart: 20,
              monthEnd: 4,
              dayEnd: 27,
              featured: true,
            },
            demandMultiplier: 2.5,
          },
        ],
      };

      const response = formatSeasonalCalendarResponse(data);

      expect(response.region).toBe("UK");
      expect(response.current_season).toBe("spring");
      expect(response.events).toHaveLength(2);
      expect(response.next_peak_event).toBeDefined();

      const first = response.events[0]!;
      expect(first.name).toBe("Spring Planting Sale");
      expect(first.demand_multiplier).toBe(1.8);
      expect(first.categories_affected).toContain("Seeds");
      expect(first.commerce_tip.length).toBeGreaterThan(0);
      expect(first.start_date).toBeDefined();
      expect(first.end_date).toBeDefined();
    });

    it("handles empty events", () => {
      const data: SeasonalCalendarData = {
        region: "US",
        currentSeason: "summer",
        events: [],
      };

      const response = formatSeasonalCalendarResponse(data);
      expect(response.events).toHaveLength(0);
      expect(response.region).toBe("US");
    });
  });
});
