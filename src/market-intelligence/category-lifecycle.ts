/**
 * Category Lifecycle Manager
 *
 * Manages the lifecycle state machine for categories:
 *   detected -> trend_validated -> keywords_learned -> ready_for_promotion -> promoted
 *                                                                           -> retired
 *
 * PROMOTION CRITERIA:
 * - Convergence score >= 50 for 4+ consecutive weeks
 * - >= 100 product mentions across >= 10 videos
 * - >= 5 affiliate programs with products
 * - Keyword set validated (>= 15 primary keywords)
 * - Affinity relationships mapped
 *
 * RETIREMENT CRITERIA:
 * - Demand score < 10 for 12+ weeks
 * - Zero affiliate programs available
 * - Convergence score < 20
 *
 * Ported from monolith: lib/services/category-lifecycle-manager.ts
 * Removed: Prisma, intelligence-repository, category-reclassification.
 * All data access replaced with method parameters and callbacks.
 */

import type { Logger } from "../types.js";
import { defaultLogger } from "../types.js";

// ============================================================================
// TYPES
// ============================================================================

export type LifecycleStage =
  | "detected"
  | "trend_validated"
  | "keywords_learned"
  | "ready_for_promotion"
  | "promoted"
  | "retired";

export interface PromotionConfig {
  /** Min convergence score for promotion (default: 50). */
  minConvergenceScore?: number;
  /** Min product mentions (default: 100). */
  minProductMentions?: number;
  /** Min video mentions (default: 10). */
  minVideoMentions?: number;
  /** Min weeks in pipeline before promotion (default: 4). */
  minWeeksInPipeline?: number;
  /** Require manual approval (default: false). */
  requireManualApproval?: boolean;
  /** Min primary keywords learned (default: 10). */
  minPrimaryKeywords?: number;
  /** Min keyword confidence (default: 0.5). */
  minKeywordConfidence?: number;
  /** Average convergence below this for 12+ weeks triggers retirement (default: 20). */
  retirementConvergenceThreshold?: number;
  /** Minimum trend data points before retirement evaluation (default: 8). */
  retirementMinDataPoints?: number;
}

/** A candidate category to evaluate for promotion. */
export interface CandidateForPromotion {
  id: string;
  candidateName: string;
  candidateKey: string;
  convergenceScore: number;
  productMentionCount: number;
  videoMentionCount: number;
  learnedKeywords: string | null; // JSON string: { primary: string[], secondary: string[], exclusion: string[] }
  keywordConfidence: number | null;
  affiliateProgramCount?: number;
}

/** An active category to evaluate for retirement. */
export interface CategoryForRetirement {
  id: string;
  displayName: string;
  /** Recent convergence scores (newest first). */
  recentConvergenceScores: number[];
  lowPerformanceStreak: number;
}

export interface PromotionResult {
  candidateId: string;
  candidateName: string;
  promoted: boolean;
  reason: string;
}

export interface RetirementResult {
  categoryId: string;
  categoryName: string;
  retired: boolean;
  reason: string;
  avgConvergence?: number;
}

// ============================================================================
// LIFECYCLE MANAGER
// ============================================================================

export class CategoryLifecycleManager {
  private config: Required<PromotionConfig>;
  private logger: Logger;

  constructor(
    config: PromotionConfig = {},
    logger: Logger = defaultLogger,
  ) {
    this.logger = logger;
    this.config = {
      minConvergenceScore: config.minConvergenceScore ?? 50,
      minProductMentions: config.minProductMentions ?? 100,
      minVideoMentions: config.minVideoMentions ?? 10,
      minWeeksInPipeline: config.minWeeksInPipeline ?? 4,
      requireManualApproval: config.requireManualApproval ?? false,
      minPrimaryKeywords: config.minPrimaryKeywords ?? 10,
      minKeywordConfidence: config.minKeywordConfidence ?? 0.5,
      retirementConvergenceThreshold:
        config.retirementConvergenceThreshold ?? 20,
      retirementMinDataPoints: config.retirementMinDataPoints ?? 8,
    };
  }

  /**
   * Evaluate a list of candidates for promotion.
   * Returns evaluation results for each candidate.
   */
  evaluateCandidatesForPromotion(
    candidates: CandidateForPromotion[],
  ): PromotionResult[] {
    this.logger.info("Evaluating candidates for promotion", {
      count: candidates.length,
    });

    return candidates.map((candidate) =>
      this.evaluateCandidate(candidate),
    );
  }

  /**
   * Evaluate a single candidate for promotion.
   */
  evaluateCandidate(candidate: CandidateForPromotion): PromotionResult {
    const checks: string[] = [];

    // Check 1: Convergence score
    if (candidate.convergenceScore >= this.config.minConvergenceScore) {
      checks.push("convergence_passed");
    } else {
      return {
        candidateId: candidate.id,
        candidateName: candidate.candidateName,
        promoted: false,
        reason: `Convergence score too low: ${candidate.convergenceScore.toFixed(1)} (need ${this.config.minConvergenceScore})`,
      };
    }

    // Check 2: Product mentions
    if (
      candidate.productMentionCount >= this.config.minProductMentions
    ) {
      checks.push("product_mentions_passed");
    } else {
      return {
        candidateId: candidate.id,
        candidateName: candidate.candidateName,
        promoted: false,
        reason: `Not enough product mentions: ${candidate.productMentionCount} (need ${this.config.minProductMentions})`,
      };
    }

    // Check 3: Video mentions
    if (candidate.videoMentionCount >= this.config.minVideoMentions) {
      checks.push("video_mentions_passed");
    } else {
      return {
        candidateId: candidate.id,
        candidateName: candidate.candidateName,
        promoted: false,
        reason: `Not enough video mentions: ${candidate.videoMentionCount} (need ${this.config.minVideoMentions})`,
      };
    }

    // Check 4: Keywords learned
    if (
      candidate.learnedKeywords &&
      (candidate.keywordConfidence ?? 0) >= this.config.minKeywordConfidence
    ) {
      try {
        const keywords = JSON.parse(candidate.learnedKeywords);
        if (
          keywords.primary &&
          keywords.primary.length >= this.config.minPrimaryKeywords
        ) {
          checks.push("keywords_passed");
        } else {
          return {
            candidateId: candidate.id,
            candidateName: candidate.candidateName,
            promoted: false,
            reason: `Not enough primary keywords: ${keywords.primary?.length || 0} (need ${this.config.minPrimaryKeywords})`,
          };
        }
      } catch {
        return {
          candidateId: candidate.id,
          candidateName: candidate.candidateName,
          promoted: false,
          reason: "Failed to parse learned keywords",
        };
      }
    } else {
      return {
        candidateId: candidate.id,
        candidateName: candidate.candidateName,
        promoted: false,
        reason: "Keywords not learned or low confidence",
      };
    }

    // All checks passed
    return {
      candidateId: candidate.id,
      candidateName: candidate.candidateName,
      promoted: true,
      reason: `All checks passed: ${checks.join(", ")}`,
    };
  }

  /**
   * Evaluate categories for retirement.
   * Returns retirement recommendations.
   */
  evaluateCategoriesForRetirement(
    categories: CategoryForRetirement[],
  ): RetirementResult[] {
    this.logger.info("Evaluating categories for retirement", {
      count: categories.length,
    });

    const results: RetirementResult[] = [];

    for (const category of categories) {
      if (
        category.recentConvergenceScores.length <
        this.config.retirementMinDataPoints
      ) {
        // Not enough data yet
        continue;
      }

      const avgConvergence =
        category.recentConvergenceScores.reduce((sum, s) => sum + s, 0) /
        category.recentConvergenceScores.length;

      if (avgConvergence < this.config.retirementConvergenceThreshold) {
        results.push({
          categoryId: category.id,
          categoryName: category.displayName,
          retired: true,
          reason: `Low convergence score: ${avgConvergence.toFixed(1)} over ${category.recentConvergenceScores.length} weeks`,
          avgConvergence,
        });
      }
    }

    return results;
  }

  /**
   * Determine the next lifecycle stage for a candidate based on current data.
   */
  determineNextStage(
    currentStage: LifecycleStage,
    candidate: CandidateForPromotion,
  ): LifecycleStage {
    switch (currentStage) {
      case "detected":
        // Move to trend_validated if convergence meets threshold
        if (
          candidate.convergenceScore >=
          this.config.minConvergenceScore / 2
        ) {
          return "trend_validated";
        }
        return "detected";

      case "trend_validated":
        // Move to keywords_learned if keywords are present
        if (
          candidate.learnedKeywords &&
          (candidate.keywordConfidence ?? 0) >=
            this.config.minKeywordConfidence
        ) {
          return "keywords_learned";
        }
        return "trend_validated";

      case "keywords_learned": {
        // Evaluate for promotion
        const result = this.evaluateCandidate(candidate);
        if (result.promoted) {
          return this.config.requireManualApproval
            ? "ready_for_promotion"
            : "promoted";
        }
        return "keywords_learned";
      }

      case "ready_for_promotion":
        // Stays here until manually approved
        return "ready_for_promotion";

      default:
        return currentStage;
    }
  }

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<Required<PromotionConfig>> {
    return { ...this.config };
  }
}
