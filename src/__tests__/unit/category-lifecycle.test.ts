/**
 * Unit tests for category lifecycle state transitions (Layer 2).
 *
 * Tests:
 * - Promotion evaluation with all criteria
 * - Retirement evaluation
 * - Stage transition logic
 * - Config defaults
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  CategoryLifecycleManager,
  type CandidateForPromotion,
  type CategoryForRetirement,
} from "../../market-intelligence/category-lifecycle.js";

describe("Category Lifecycle Manager", () => {
  let manager: CategoryLifecycleManager;

  beforeEach(() => {
    manager = new CategoryLifecycleManager();
  });

  describe("getConfig", () => {
    it("returns default config values", () => {
      const config = manager.getConfig();
      expect(config.minConvergenceScore).toBe(50);
      expect(config.minProductMentions).toBe(100);
      expect(config.minVideoMentions).toBe(10);
      expect(config.minWeeksInPipeline).toBe(4);
      expect(config.requireManualApproval).toBe(false);
      expect(config.minPrimaryKeywords).toBe(10);
      expect(config.minKeywordConfidence).toBe(0.5);
      expect(config.retirementConvergenceThreshold).toBe(20);
    });

    it("accepts custom config overrides", () => {
      const custom = new CategoryLifecycleManager({
        minConvergenceScore: 75,
        requireManualApproval: true,
      });
      const config = custom.getConfig();
      expect(config.minConvergenceScore).toBe(75);
      expect(config.requireManualApproval).toBe(true);
      // Other defaults should remain
      expect(config.minProductMentions).toBe(100);
    });
  });

  describe("evaluateCandidate", () => {
    function createCandidate(
      overrides?: Partial<CandidateForPromotion>,
    ): CandidateForPromotion {
      return {
        id: "cat-1",
        candidateName: "Autumn Perennials",
        candidateKey: "autumn-perennials",
        convergenceScore: 60,
        productMentionCount: 150,
        videoMentionCount: 25,
        learnedKeywords: JSON.stringify({
          primary: Array.from({ length: 15 }, (_, i) => `keyword_${i}`),
          secondary: ["sec1", "sec2"],
          exclusion: ["excl1"],
        }),
        keywordConfidence: 0.7,
        affiliateProgramCount: 8,
        ...overrides,
      };
    }

    it("promotes a candidate that passes all checks", () => {
      const candidate = createCandidate();
      const result = manager.evaluateCandidate(candidate);

      expect(result.promoted).toBe(true);
      expect(result.reason).toContain("All checks passed");
    });

    it("rejects when convergence score too low", () => {
      const candidate = createCandidate({ convergenceScore: 30 });
      const result = manager.evaluateCandidate(candidate);

      expect(result.promoted).toBe(false);
      expect(result.reason).toContain("Convergence score too low");
    });

    it("rejects when product mentions insufficient", () => {
      const candidate = createCandidate({ productMentionCount: 50 });
      const result = manager.evaluateCandidate(candidate);

      expect(result.promoted).toBe(false);
      expect(result.reason).toContain("Not enough product mentions");
    });

    it("rejects when video mentions insufficient", () => {
      const candidate = createCandidate({ videoMentionCount: 5 });
      const result = manager.evaluateCandidate(candidate);

      expect(result.promoted).toBe(false);
      expect(result.reason).toContain("Not enough video mentions");
    });

    it("rejects when keywords not learned", () => {
      const candidate = createCandidate({
        learnedKeywords: null,
        keywordConfidence: null,
      });
      const result = manager.evaluateCandidate(candidate);

      expect(result.promoted).toBe(false);
      expect(result.reason).toContain("Keywords not learned");
    });

    it("rejects when keyword confidence too low", () => {
      const candidate = createCandidate({ keywordConfidence: 0.2 });
      const result = manager.evaluateCandidate(candidate);

      expect(result.promoted).toBe(false);
      expect(result.reason).toContain("Keywords not learned or low confidence");
    });

    it("rejects when not enough primary keywords", () => {
      const candidate = createCandidate({
        learnedKeywords: JSON.stringify({
          primary: ["kw1", "kw2", "kw3"],
          secondary: [],
          exclusion: [],
        }),
      });
      const result = manager.evaluateCandidate(candidate);

      expect(result.promoted).toBe(false);
      expect(result.reason).toContain("Not enough primary keywords");
    });
  });

  describe("evaluateCandidatesForPromotion", () => {
    it("evaluates multiple candidates in batch", () => {
      const candidates: CandidateForPromotion[] = [
        {
          id: "cat-1",
          candidateName: "Good Category",
          candidateKey: "good",
          convergenceScore: 60,
          productMentionCount: 150,
          videoMentionCount: 20,
          learnedKeywords: JSON.stringify({
            primary: Array.from({ length: 15 }, (_, i) => `kw${i}`),
          }),
          keywordConfidence: 0.7,
        },
        {
          id: "cat-2",
          candidateName: "Weak Category",
          candidateKey: "weak",
          convergenceScore: 20,
          productMentionCount: 10,
          videoMentionCount: 2,
          learnedKeywords: null,
          keywordConfidence: null,
        },
      ];

      const results = manager.evaluateCandidatesForPromotion(candidates);

      expect(results).toHaveLength(2);
      expect(results[0]!.promoted).toBe(true);
      expect(results[1]!.promoted).toBe(false);
    });
  });

  describe("evaluateCategoriesForRetirement", () => {
    it("recommends retirement for sustained low convergence", () => {
      const categories: CategoryForRetirement[] = [
        {
          id: "cat-old",
          displayName: "Dying Category",
          recentConvergenceScores: [5, 8, 12, 7, 10, 6, 9, 11, 8, 7],
          lowPerformanceStreak: 10,
        },
      ];

      const results = manager.evaluateCategoriesForRetirement(categories);

      expect(results).toHaveLength(1);
      expect(results[0]!.retired).toBe(true);
      expect(results[0]!.reason).toContain("Low convergence score");
    });

    it("does not retire categories with insufficient data", () => {
      const categories: CategoryForRetirement[] = [
        {
          id: "cat-new",
          displayName: "New Category",
          recentConvergenceScores: [5, 8, 12],
          lowPerformanceStreak: 3,
        },
      ];

      const results = manager.evaluateCategoriesForRetirement(categories);
      expect(results).toHaveLength(0);
    });

    it("does not retire healthy categories", () => {
      const categories: CategoryForRetirement[] = [
        {
          id: "cat-healthy",
          displayName: "Healthy Category",
          recentConvergenceScores: [50, 55, 48, 52, 60, 58, 53, 51, 49, 55],
          lowPerformanceStreak: 0,
        },
      ];

      const results = manager.evaluateCategoriesForRetirement(categories);
      expect(results).toHaveLength(0);
    });
  });

  describe("determineNextStage", () => {
    it("moves from detected to trend_validated when convergence is sufficient", () => {
      const candidate: CandidateForPromotion = {
        id: "cat-1",
        candidateName: "Test",
        candidateKey: "test",
        convergenceScore: 30, // >= minConvergenceScore/2 = 25
        productMentionCount: 0,
        videoMentionCount: 0,
        learnedKeywords: null,
        keywordConfidence: null,
      };

      const nextStage = manager.determineNextStage("detected", candidate);
      expect(nextStage).toBe("trend_validated");
    });

    it("stays at detected when convergence is too low", () => {
      const candidate: CandidateForPromotion = {
        id: "cat-1",
        candidateName: "Test",
        candidateKey: "test",
        convergenceScore: 10, // < 25
        productMentionCount: 0,
        videoMentionCount: 0,
        learnedKeywords: null,
        keywordConfidence: null,
      };

      const nextStage = manager.determineNextStage("detected", candidate);
      expect(nextStage).toBe("detected");
    });

    it("moves from trend_validated to keywords_learned when keywords present", () => {
      const candidate: CandidateForPromotion = {
        id: "cat-1",
        candidateName: "Test",
        candidateKey: "test",
        convergenceScore: 60,
        productMentionCount: 150,
        videoMentionCount: 20,
        learnedKeywords: JSON.stringify({ primary: Array(15).fill("kw") }),
        keywordConfidence: 0.7,
      };

      const nextStage = manager.determineNextStage(
        "trend_validated",
        candidate,
      );
      expect(nextStage).toBe("keywords_learned");
    });

    it("moves from keywords_learned to promoted when all criteria pass", () => {
      const candidate: CandidateForPromotion = {
        id: "cat-1",
        candidateName: "Test",
        candidateKey: "test",
        convergenceScore: 60,
        productMentionCount: 150,
        videoMentionCount: 20,
        learnedKeywords: JSON.stringify({
          primary: Array.from({ length: 15 }, (_, i) => `kw${i}`),
        }),
        keywordConfidence: 0.7,
      };

      const nextStage = manager.determineNextStage(
        "keywords_learned",
        candidate,
      );
      expect(nextStage).toBe("promoted");
    });

    it("moves to ready_for_promotion when manual approval required", () => {
      const manualManager = new CategoryLifecycleManager({
        requireManualApproval: true,
      });
      const candidate: CandidateForPromotion = {
        id: "cat-1",
        candidateName: "Test",
        candidateKey: "test",
        convergenceScore: 60,
        productMentionCount: 150,
        videoMentionCount: 20,
        learnedKeywords: JSON.stringify({
          primary: Array.from({ length: 15 }, (_, i) => `kw${i}`),
        }),
        keywordConfidence: 0.7,
      };

      const nextStage = manualManager.determineNextStage(
        "keywords_learned",
        candidate,
      );
      expect(nextStage).toBe("ready_for_promotion");
    });

    it("stays at ready_for_promotion until manually approved", () => {
      const candidate: CandidateForPromotion = {
        id: "cat-1",
        candidateName: "Test",
        candidateKey: "test",
        convergenceScore: 100,
        productMentionCount: 500,
        videoMentionCount: 50,
        learnedKeywords: JSON.stringify({ primary: Array(20).fill("kw") }),
        keywordConfidence: 0.9,
      };

      const nextStage = manager.determineNextStage(
        "ready_for_promotion",
        candidate,
      );
      expect(nextStage).toBe("ready_for_promotion");
    });
  });
});
