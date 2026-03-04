/**
 * Channel Vetting System
 *
 * 5-dimension channel authority scoring system with configurable evaluators.
 * Produces trustworthy conclusions with confidence scoring and human review flagging.
 *
 * Dimensions:
 * 1. Published Books (15%)
 * 2. Editorial Vetting (10%)
 * 3. Media Presence (15%)
 * 4. Professional Credentials (20%)
 * 5. Institutional Affiliation (15%)
 * 6. Ethical Alignment (10%)
 * 7. Production Quality (15%)
 *
 * Budget Target: <$0.01 per channel evaluation
 * Confidence Threshold: 65% minimum for auto-approval
 *
 * Ported from monolith: lib/services/automated-channel-vetting/index.ts
 * Removed: Prisma, specific evaluator imports.
 * Replaced with configurable evaluator functions and data interfaces.
 */

import type { Logger } from "../types.js";
import { defaultLogger } from "../types.js";

// ============================================================================
// TYPES
// ============================================================================

export type CriterionId =
  | "published_books"
  | "editorial_vetting"
  | "media_presence"
  | "professional_credentials"
  | "institutional_affiliation"
  | "ethical_alignment"
  | "production_quality";

export interface CriterionResult {
  criterionId: CriterionId;
  score: number; // 0-100
  confidence: number; // 0-1
  evidence: string[];
  flags: string[];
  details?: Record<string, unknown>;
}

export interface CriterionMetadata {
  id: CriterionId;
  name: string;
  description: string;
  weight: number; // 0-1, sum = 1
}

export interface ChannelForVetting {
  id: string;
  channelId: string;
  channelName: string;
  channelUrl: string;
  description?: string | null;
  subscriberCount?: number | null;
  videoCount?: number | null;
  thumbnailUrl?: string | null;
  vettingChecklist?: string | null;
  visionAlignmentScore?: number | null;
  vettedAt?: Date | null;
}

export interface AIEvaluationResponse {
  overallAssessment: string;
  suggestedScore: number;
  confidence: number;
  reasoning: string;
  recommendsHumanReview: boolean;
  humanReviewReason?: string;
  criterionAdjustments?: Array<{
    criterionId: CriterionId;
    adjustment: number;
    reason: string;
  }>;
}

export interface VettingResult {
  channelId: string;
  score: number; // 0-100 composite
  confidence: number; // 0-1
  decision: "approved" | "rejected" | "needs_review";
  criteriaResults: CriterionResult[];
  aiAssessment?: AIEvaluationResponse;
  requiresHumanReview: boolean;
  humanReviewReasons: string[];
  evaluatedAt: Date;
  cost: number; // estimated USD
}

export interface BatchVettingResult {
  totalProcessed: number;
  approved: number;
  rejected: number;
  needsReview: number;
  errors: Array<{ channelId: string; error: string }>;
  totalCost: number;
  avgConfidence: number;
}

/** A function that evaluates a single criterion for a channel. */
export type CriterionEvaluator = (
  channel: ChannelForVetting,
) => Promise<CriterionResult>;

// ============================================================================
// CONSTANTS
// ============================================================================

export const CRITERIA_METADATA: CriterionMetadata[] = [
  {
    id: "published_books",
    name: "Published Books",
    description: "Author of gardening/horticulture books",
    weight: 0.15,
  },
  {
    id: "editorial_vetting",
    name: "Editorial Vetting",
    description: "Content reviewed by horticultural experts",
    weight: 0.1,
  },
  {
    id: "media_presence",
    name: "Media Presence",
    description: "TV appearances, significant YouTube presence",
    weight: 0.15,
  },
  {
    id: "professional_credentials",
    name: "Professional Credentials",
    description: "RHS, Master Gardener, horticulture degree",
    weight: 0.2,
  },
  {
    id: "institutional_affiliation",
    name: "Institutional Affiliation",
    description: "University, botanical garden, extension service",
    weight: 0.15,
  },
  {
    id: "ethical_alignment",
    name: "Ethical Alignment",
    description: "Sustainable, organic, native plant advocacy",
    weight: 0.1,
  },
  {
    id: "production_quality",
    name: "Production Quality",
    description: "Professional video production standards",
    weight: 0.15,
  },
];

export const CONFIDENCE_THRESHOLD = 0.65;
export const HIGH_SCORE_THRESHOLD = 70;
export const LOW_SCORE_THRESHOLD = 40;

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

/**
 * Calculate weighted composite score from criteria results.
 */
export function calculateCompositeScore(
  criteriaResults: CriterionResult[],
): number {
  const weights: Record<string, number> = {};
  for (const meta of CRITERIA_METADATA) {
    weights[meta.id] = meta.weight;
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const result of criteriaResults) {
    const weight = weights[result.criterionId] || 0.1;
    weightedSum += result.score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Calculate confidence in the vetting result.
 */
export function calculateConfidence(
  criteriaResults: CriterionResult[],
  hasExternalData: boolean,
): {
  overall: number;
  requiresHumanReview: boolean;
  reviewReasons: string[];
} {
  const reviewReasons: string[] = [];

  // Average criterion confidence
  const avgConfidence =
    criteriaResults.reduce((sum, c) => sum + c.confidence, 0) /
    criteriaResults.length;

  // Low confidence criteria
  const lowConfidenceCriteria = criteriaResults.filter(
    (c) => c.confidence < 0.5,
  );
  if (lowConfidenceCriteria.length >= 3) {
    reviewReasons.push(
      `${lowConfidenceCriteria.length} criteria have low confidence`,
    );
  }

  // Check for conflicting signals
  const scores = criteriaResults.map((c) => c.score);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) /
    scores.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev > 25) {
    reviewReasons.push("Conflicting criterion scores");
  }

  // Check flags
  const allFlags = criteriaResults.flatMap((c) => c.flags);
  if (allFlags.length > 0) {
    reviewReasons.push(`Flags: ${allFlags.join(", ")}`);
  }

  // External data bonus
  const externalBonus = hasExternalData ? 0.1 : 0;

  const overall = Math.min(1, avgConfidence + externalBonus);
  const requiresHumanReview =
    overall < CONFIDENCE_THRESHOLD || reviewReasons.length > 0;

  return { overall, requiresHumanReview, reviewReasons };
}

/**
 * Determine decision based on composite score and confidence.
 */
export function determineDecision(
  compositeScore: number,
  confidence: { overall: number; requiresHumanReview: boolean },
): "approved" | "rejected" | "needs_review" {
  if (confidence.requiresHumanReview) return "needs_review";
  if (compositeScore >= HIGH_SCORE_THRESHOLD) return "approved";
  if (compositeScore <= LOW_SCORE_THRESHOLD) return "rejected";
  return "needs_review";
}

// ============================================================================
// MAIN EVALUATION
// ============================================================================

/**
 * Evaluate a channel using provided criterion evaluators.
 *
 * Unlike the monolith version, this function takes evaluators as parameters
 * rather than importing them. This makes it fully standalone and testable.
 */
export async function evaluateChannel(
  channel: ChannelForVetting,
  evaluators: CriterionEvaluator[],
  options?: {
    aiEvaluator?: (
      channel: ChannelForVetting,
      criteriaResults: CriterionResult[],
    ) => Promise<AIEvaluationResponse | null>;
    logger?: Logger;
  },
): Promise<VettingResult> {
  const logger = options?.logger ?? defaultLogger;
  const startTime = Date.now();
  let cost = 0;

  // Run all evaluators in parallel
  let criteriaResults = await Promise.all(
    evaluators.map((evaluator) => evaluator(channel)),
  );

  // Optional AI evaluation for ambiguous cases
  let aiAssessment: AIEvaluationResponse | undefined;
  if (options?.aiEvaluator && needsAIEvaluation(criteriaResults)) {
    const aiResult = await options.aiEvaluator(channel, criteriaResults);
    if (aiResult) {
      aiAssessment = aiResult;
      criteriaResults = applyAIAdjustments(criteriaResults, aiResult);
      cost += estimateAICost();
    }
  }

  // Calculate confidence and determine decision
  const hasExternalData = criteriaResults.some(
    (c) =>
      c.criterionId === "published_books" &&
      ((c.details as { booksFound?: number })?.booksFound ?? 0) > 0,
  );
  const confidenceResult = calculateConfidence(criteriaResults, hasExternalData);
  const compositeScore = calculateCompositeScore(criteriaResults);
  const decision = determineDecision(compositeScore, confidenceResult);

  const result: VettingResult = {
    channelId: channel.id,
    score: compositeScore,
    confidence: confidenceResult.overall,
    decision,
    criteriaResults,
    aiAssessment,
    requiresHumanReview: confidenceResult.requiresHumanReview,
    humanReviewReasons: confidenceResult.reviewReasons,
    evaluatedAt: new Date(),
    cost,
  };

  const elapsed = Date.now() - startTime;
  logger.info("Channel vetting evaluation complete", {
    channelName: channel.channelName,
    elapsed: `${elapsed}ms`,
    score: compositeScore.toFixed(0),
    confidence: `${(confidenceResult.overall * 100).toFixed(0)}%`,
    decision,
  });

  return result;
}

// ============================================================================
// AI EVALUATION HELPERS (ported from ai-composite-evaluator.ts)
// ============================================================================

/**
 * Determine if AI evaluation is needed for ambiguous cases.
 */
export function needsAIEvaluation(
  criteriaResults: CriterionResult[],
): boolean {
  // Count criteria with low confidence
  const lowConfidenceCriteria = criteriaResults.filter(
    (c) => c.confidence < 0.6,
  );
  if (lowConfidenceCriteria.length >= 3) return true;

  // High variance indicates conflicting signals
  const scores = criteriaResults.map((c) => c.score);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) /
    scores.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev > 25) return true;

  // Borderline overall score
  const compositeScore = calculateCompositeScore(criteriaResults);
  if (compositeScore >= 55 && compositeScore <= 75) return true;

  return false;
}

/**
 * Apply AI adjustments to criteria results.
 */
export function applyAIAdjustments(
  criteriaResults: CriterionResult[],
  aiResponse: AIEvaluationResponse,
): CriterionResult[] {
  if (
    !aiResponse.criterionAdjustments ||
    aiResponse.criterionAdjustments.length === 0
  ) {
    return criteriaResults;
  }

  return criteriaResults.map((result) => {
    const adjustment = aiResponse.criterionAdjustments?.find(
      (adj) => adj.criterionId === result.criterionId,
    );

    if (adjustment) {
      return {
        ...result,
        score: Math.max(
          0,
          Math.min(100, result.score + adjustment.adjustment),
        ),
        evidence: [
          ...result.evidence,
          `AI adjustment: ${adjustment.reason}`,
        ],
      };
    }

    return result;
  });
}

/**
 * Estimate cost of AI evaluation.
 */
export function estimateAICost(): number {
  // GPT-4o-mini: ~$0.15/1M input, ~$0.6/1M output
  // Average: ~500 input tokens, ~200 output tokens
  const inputCost = (500 / 1_000_000) * 0.15;
  const outputCost = (200 / 1_000_000) * 0.6;
  return inputCost + outputCost; // ~$0.0002
}
