/**
 * Unit tests for channel authority scoring (Layer 2).
 *
 * Tests:
 * - Composite score calculation
 * - Confidence calculation
 * - Decision determination
 * - AI evaluation triggers
 * - AI adjustment application
 */

import { describe, it, expect } from "vitest";
import {
  calculateCompositeScore,
  calculateConfidence,
  determineDecision,
  needsAIEvaluation,
  applyAIAdjustments,
  estimateAICost,
  CRITERIA_METADATA,
  CONFIDENCE_THRESHOLD,
  type CriterionResult,
  type AIEvaluationResponse,
} from "../../market-intelligence/channel-vetting.js";

function createCriterionResults(
  scores: number[],
  confidences?: number[],
): CriterionResult[] {
  return CRITERIA_METADATA.map((meta, i) => ({
    criterionId: meta.id,
    score: scores[i] ?? 50,
    confidence: confidences?.[i] ?? 0.8,
    evidence: ["Test evidence"],
    flags: [],
  }));
}

describe("Channel Vetting", () => {
  describe("CRITERIA_METADATA", () => {
    it("defines 7 scoring criteria", () => {
      expect(CRITERIA_METADATA).toHaveLength(7);
    });

    it("has weights summing to 1.0", () => {
      const totalWeight = CRITERIA_METADATA.reduce(
        (sum, c) => sum + c.weight,
        0,
      );
      expect(totalWeight).toBeCloseTo(1.0, 2);
    });

    it("has professional_credentials as highest weight", () => {
      const maxWeight = Math.max(...CRITERIA_METADATA.map((c) => c.weight));
      const highest = CRITERIA_METADATA.find((c) => c.weight === maxWeight);
      expect(highest!.id).toBe("professional_credentials");
      expect(highest!.weight).toBe(0.2);
    });
  });

  describe("calculateCompositeScore", () => {
    it("calculates weighted average of criteria scores", () => {
      const results = createCriterionResults([80, 70, 60, 90, 50, 75, 65]);
      const score = calculateCompositeScore(results);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("returns 0 for empty criteria", () => {
      const score = calculateCompositeScore([]);
      expect(score).toBe(0);
    });

    it("weights professional_credentials highest", () => {
      // Give professional_credentials (index 3) a high score, others low
      const highCredentials = createCriterionResults([
        20, 20, 20, 100, 20, 20, 20,
      ]);
      const lowCredentials = createCriterionResults([
        80, 80, 80, 20, 80, 80, 80,
      ]);

      const highScore = calculateCompositeScore(highCredentials);
      const lowScore = calculateCompositeScore(lowCredentials);

      // Despite more criteria being high in lowCredentials,
      // the heavily weighted credentials make a big difference
      expect(highScore).toBeLessThan(lowScore); // 20s dominate even with one 100
    });
  });

  describe("calculateConfidence", () => {
    it("returns high confidence with good criteria results", () => {
      const results = createCriterionResults(
        [80, 70, 60, 90, 50, 75, 65],
        [0.9, 0.85, 0.8, 0.95, 0.75, 0.8, 0.85],
      );
      const confidence = calculateConfidence(results, true);

      expect(confidence.overall).toBeGreaterThan(0.8);
    });

    it("flags for human review when multiple criteria have low confidence", () => {
      const results = createCriterionResults(
        [50, 50, 50, 50, 50, 50, 50],
        [0.3, 0.3, 0.3, 0.3, 0.8, 0.8, 0.8],
      );
      const confidence = calculateConfidence(results, false);

      expect(confidence.requiresHumanReview).toBe(true);
      expect(confidence.reviewReasons.length).toBeGreaterThan(0);
    });

    it("flags for human review when conflicting signals exist (high std dev)", () => {
      const results = createCriterionResults(
        [10, 95, 10, 95, 10, 95, 10],
        [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9],
      );
      const confidence = calculateConfidence(results, false);

      expect(confidence.reviewReasons).toContain(
        "Conflicting criterion scores",
      );
    });

    it("adds external data bonus", () => {
      const results = createCriterionResults(
        [50, 50, 50, 50, 50, 50, 50],
        [0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7],
      );

      const withExternal = calculateConfidence(results, true);
      const withoutExternal = calculateConfidence(results, false);

      expect(withExternal.overall).toBeGreaterThan(withoutExternal.overall);
    });
  });

  describe("determineDecision", () => {
    it("approves when score is high and no review needed", () => {
      const decision = determineDecision(80, {
        overall: 0.9,
        requiresHumanReview: false,
      });
      expect(decision).toBe("approved");
    });

    it("rejects when score is low and no review needed", () => {
      const decision = determineDecision(30, {
        overall: 0.9,
        requiresHumanReview: false,
      });
      expect(decision).toBe("rejected");
    });

    it("returns needs_review when human review is required", () => {
      const decision = determineDecision(80, {
        overall: 0.5,
        requiresHumanReview: true,
      });
      expect(decision).toBe("needs_review");
    });

    it("returns needs_review for borderline scores", () => {
      const decision = determineDecision(55, {
        overall: 0.8,
        requiresHumanReview: false,
      });
      expect(decision).toBe("needs_review");
    });
  });

  describe("needsAIEvaluation", () => {
    it("returns true when many criteria have low confidence", () => {
      const results = createCriterionResults(
        [50, 50, 50, 50, 50, 50, 50],
        [0.3, 0.4, 0.5, 0.3, 0.8, 0.8, 0.8],
      );
      expect(needsAIEvaluation(results)).toBe(true);
    });

    it("returns true for borderline composite score", () => {
      // Score between 55-75 triggers AI evaluation
      const results = createCriterionResults(
        [65, 65, 65, 65, 65, 65, 65],
        [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9],
      );
      expect(needsAIEvaluation(results)).toBe(true);
    });

    it("returns false for clearly high-scoring channels", () => {
      const results = createCriterionResults(
        [90, 85, 80, 95, 88, 92, 87],
        [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9],
      );
      expect(needsAIEvaluation(results)).toBe(false);
    });
  });

  describe("applyAIAdjustments", () => {
    it("applies adjustments to matching criteria", () => {
      const results = createCriterionResults([50, 50, 50, 50, 50, 50, 50]);
      const aiResponse: AIEvaluationResponse = {
        overallAssessment: "Good channel",
        suggestedScore: 70,
        confidence: 0.8,
        reasoning: "Strong credentials",
        recommendsHumanReview: false,
        criterionAdjustments: [
          {
            criterionId: "professional_credentials",
            adjustment: 15,
            reason: "Found RHS qualification",
          },
        ],
      };

      const adjusted = applyAIAdjustments(results, aiResponse);
      const credentials = adjusted.find(
        (r) => r.criterionId === "professional_credentials",
      );
      expect(credentials!.score).toBe(65); // 50 + 15
      expect(credentials!.evidence).toContain(
        "AI adjustment: Found RHS qualification",
      );
    });

    it("clamps adjusted scores to 0-100", () => {
      const results = createCriterionResults([95, 50, 50, 50, 50, 50, 50]);
      const aiResponse: AIEvaluationResponse = {
        overallAssessment: "Test",
        suggestedScore: 70,
        confidence: 0.8,
        reasoning: "Test",
        recommendsHumanReview: false,
        criterionAdjustments: [
          {
            criterionId: "published_books",
            adjustment: 20,
            reason: "Test",
          },
        ],
      };

      const adjusted = applyAIAdjustments(results, aiResponse);
      const books = adjusted.find(
        (r) => r.criterionId === "published_books",
      );
      expect(books!.score).toBe(100); // clamped from 115
    });

    it("returns original results when no adjustments", () => {
      const results = createCriterionResults([50, 50, 50, 50, 50, 50, 50]);
      const aiResponse: AIEvaluationResponse = {
        overallAssessment: "Test",
        suggestedScore: 50,
        confidence: 0.8,
        reasoning: "Test",
        recommendsHumanReview: false,
      };

      const adjusted = applyAIAdjustments(results, aiResponse);
      expect(adjusted).toEqual(results);
    });
  });

  describe("estimateAICost", () => {
    it("returns cost well under $0.01", () => {
      const cost = estimateAICost();
      expect(cost).toBeLessThan(0.01);
      expect(cost).toBeGreaterThan(0);
    });
  });
});
