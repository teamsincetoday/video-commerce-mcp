/**
 * Unit tests for convergence scoring (Layer 2).
 *
 * Tests:
 * - Convergence score formula
 * - Competition analysis
 * - Trend direction analysis
 * - Opportunity analysis with recommendations
 * - Full convergence detection pipeline
 */

import { describe, it, expect } from "vitest";
import {
  calculateConvergenceScore,
  analyzeCompetition,
  analyzeTrendDirection,
  generateOpportunityAnalysis,
  calculateConvergenceConfidence,
  generateReasoning,
  detectConvergence,
  type ConvergenceInput,
  type ConvergenceSignals,
} from "../../market-intelligence/convergence-detector.js";

describe("Convergence Detector", () => {
  describe("calculateConvergenceScore", () => {
    it("returns 100 with perfect scores and no competition", () => {
      const score = calculateConvergenceScore(100, 100, 100, 0);
      expect(score).toBe(100);
    });

    it("returns 50 with perfect scores and max competition", () => {
      const score = calculateConvergenceScore(100, 100, 100, 100);
      expect(score).toBe(50);
    });

    it("returns 0 when all forces are zero", () => {
      const score = calculateConvergenceScore(0, 0, 0, 0);
      expect(score).toBe(0);
    });

    it("never returns below 0", () => {
      const score = calculateConvergenceScore(10, 10, 10, 100);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it("never returns above 100", () => {
      const score = calculateConvergenceScore(100, 100, 100, 0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("gives moderate score for balanced inputs", () => {
      const score = calculateConvergenceScore(60, 60, 60, 40);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(100);
    });
  });

  describe("analyzeCompetition", () => {
    it("scores low competition correctly", () => {
      const result = analyzeCompetition({
        competitorCount: 5,
        contentVolume: 20,
        averageContentQuality: 50,
      });
      expect(result.competitionScore).toBeLessThan(30);
      expect(result.barrierToEntry).toBeLessThan(50);
    });

    it("scores high competition correctly", () => {
      const result = analyzeCompetition({
        competitorCount: 100,
        contentVolume: 1000,
        averageContentQuality: 80,
      });
      expect(result.competitionScore).toBeGreaterThan(70);
    });

    it("caps competition score at 100", () => {
      const result = analyzeCompetition({
        competitorCount: 200,
        contentVolume: 2000,
        averageContentQuality: 100,
      });
      expect(result.competitionScore).toBeLessThanOrEqual(100);
    });

    it("returns correct data quality based on content volume", () => {
      const low = analyzeCompetition({
        competitorCount: 1,
        contentVolume: 3,
        averageContentQuality: 50,
      });
      const high = analyzeCompetition({
        competitorCount: 1,
        contentVolume: 50,
        averageContentQuality: 50,
      });
      expect(low.dataQuality).toBeLessThan(1);
      expect(high.dataQuality).toBe(1);
    });
  });

  describe("analyzeTrendDirection", () => {
    it("returns stable for insufficient data (< 7 points)", () => {
      const result = analyzeTrendDirection([50, 52, 48, 51, 49]);
      expect(result.direction).toBe("stable");
      expect(result.velocity).toBe(0);
    });

    it("detects emerging trend (> 20% growth)", () => {
      // Newest first: recent high, previous low
      const scores = [80, 78, 75, 72, 70, 68, 65, 40, 38, 35, 33, 30, 28, 25];
      const result = analyzeTrendDirection(scores);
      expect(result.direction).toBe("emerging");
      expect(result.velocity).toBeGreaterThan(20);
    });

    it("detects rising trend (5-20% growth)", () => {
      const scores = [60, 58, 57, 56, 55, 54, 53, 50, 49, 49, 48, 48, 47, 47];
      const result = analyzeTrendDirection(scores);
      expect(result.direction).toBe("rising");
    });

    it("detects stable trend (-5% to 5%)", () => {
      const scores = [50, 51, 49, 50, 51, 50, 49, 50, 51, 49, 50, 51, 50, 49];
      const result = analyzeTrendDirection(scores);
      expect(result.direction).toBe("stable");
    });

    it("detects declining trend (-5% to -20%)", () => {
      const scores = [40, 42, 43, 44, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56];
      const result = analyzeTrendDirection(scores);
      expect(result.direction).toBe("declining");
    });
  });

  describe("generateOpportunityAnalysis", () => {
    it("recommends invest_now for high convergence + emerging", () => {
      const result = generateOpportunityAnalysis({
        convergenceScore: 30,
        demandScore: 80,
        commissionScore: 70,
        authorityScore: 60,
        competitionScore: 30,
        trendDirection: "emerging",
        velocityScore: 25,
      });
      expect(result.recommendation).toBe("invest_now");
    });

    it("recommends skip for very low convergence", () => {
      const result = generateOpportunityAnalysis({
        convergenceScore: 5,
        demandScore: 20,
        commissionScore: 10,
        authorityScore: 15,
        competitionScore: 80,
        trendDirection: "declining",
        velocityScore: -15,
      });
      expect(result.recommendation).toBe("skip");
    });

    it("recommends partner_first when authority is low", () => {
      const result = generateOpportunityAnalysis({
        convergenceScore: 25,
        demandScore: 75,
        commissionScore: 65,
        authorityScore: 30,
        competitionScore: 40,
        trendDirection: "stable",
        velocityScore: 0,
      });
      expect(result.recommendation).toBe("partner_first");
    });

    it("includes financial estimates", () => {
      const result = generateOpportunityAnalysis({
        convergenceScore: 50,
        demandScore: 80,
        commissionScore: 70,
        authorityScore: 60,
        competitionScore: 30,
        trendDirection: "rising",
        velocityScore: 10,
      });
      expect(result.estimatedRevenue).toBeGreaterThan(0);
      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.roiEstimate).toBeGreaterThanOrEqual(0);
      expect(result.timeToRevenue).toBeGreaterThan(0);
    });
  });

  describe("calculateConvergenceConfidence", () => {
    it("returns high confidence with good data", () => {
      const confidence = calculateConvergenceConfidence(0.9, 0.85, 14);
      expect(confidence).toBeGreaterThan(0.8);
    });

    it("returns low confidence with small sample", () => {
      const confidence = calculateConvergenceConfidence(0.9, 0.9, 2);
      expect(confidence).toBeLessThan(0.5);
    });
  });

  describe("generateReasoning", () => {
    it("generates human-readable reasoning string", () => {
      const signals: ConvergenceSignals = {
        categoryId: "test",
        categoryName: "Test Category",
        demandScore: 80,
        commissionScore: 70,
        authorityScore: 60,
        competitionScore: 30,
        competitorCount: 10,
        contentVolume: 50,
        barrierToEntry: 40,
        convergenceScore: 50,
        trendDirection: "emerging",
        velocityScore: 25,
        opportunityScore: 70,
        priority: "critical",
        recommendation: "invest_now",
        estimatedRevenue: 500,
        estimatedCost: 300,
        roiEstimate: 1.7,
        timeToRevenue: 3,
        confidence: 0.85,
        calculatedAt: new Date(),
      };

      const reasoning = generateReasoning(signals);
      expect(reasoning).toContain("GREEN LIGHT");
      expect(reasoning).toContain("Strong consumer demand");
      expect(reasoning).toContain("excellent profit margins");
      expect(reasoning).toContain("low competition");
      expect(reasoning).toContain("rapid growth");
    });
  });

  describe("detectConvergence (full pipeline)", () => {
    it("runs full convergence detection from input data", () => {
      const input: ConvergenceInput = {
        categoryId: "autumn-perennials",
        categoryName: "Autumn Perennials",
        demandScore: 75,
        commissionScore: 65,
        authorityScore: 55,
        trendDataQuality: 0.8,
        competitorCount: 15,
        contentVolume: 80,
        averageContentQuality: 60,
        recentConvergenceScores: [45, 44, 43, 42, 40, 39, 38, 35, 34, 33, 32, 31, 30, 29],
        sampleSize: 14,
      };

      const signals = detectConvergence(input);

      expect(signals.categoryId).toBe("autumn-perennials");
      expect(signals.convergenceScore).toBeGreaterThan(0);
      expect(signals.trendDirection).toBeDefined();
      expect(signals.recommendation).toBeDefined();
      expect(signals.priority).toBeDefined();
      expect(signals.confidence).toBeGreaterThan(0);
      expect(signals.calculatedAt).toBeInstanceOf(Date);
    });
  });
});
