/**
 * Convergence Detector
 *
 * Pillar E: Convergence Detection & Opportunity Scoring
 * - Combines demand, commission, and authority signals
 * - Detects when all three forces align (convergence)
 * - Generates actionable investment opportunities
 * - Prioritizes categories by ROI potential
 *
 * Convergence Formula:
 * convergenceScore = (demand x commission x authority) / 10000 - (competition / 2)
 *
 * Where:
 * - demand, commission, authority: 0-100 scores
 * - competition: penalty for market saturation (0-50 effective)
 *
 * Ported from monolith: lib/services/category-intelligence/convergence-detector.ts
 * Removed: Prisma, logger imports. Replaced DB queries with data interfaces.
 */

import type { Logger } from "../types.js";
import { defaultLogger } from "../types.js";

// ============================================================================
// TYPES
// ============================================================================

export interface ConvergenceSignals {
  categoryId: string;
  categoryName: string;

  // The Three Forces
  demandScore: number; // 0-100
  commissionScore: number; // 0-100
  authorityScore: number; // 0-100

  // Competition Analysis
  competitionScore: number; // 0-100 (high = very competitive)
  competitorCount: number;
  contentVolume: number; // Total videos in category
  barrierToEntry: number; // 0-100

  // Convergence
  convergenceScore: number; // 0-100 composite
  trendDirection:
    | "emerging"
    | "rising"
    | "stable"
    | "declining"
    | "dying";
  velocityScore: number; // % change per week

  // Opportunity Analysis
  opportunityScore: number; // 0-100
  priority: "critical" | "high" | "medium" | "low" | "avoid";
  recommendation:
    | "invest_now"
    | "watch_closely"
    | "test_small"
    | "partner_first"
    | "skip";

  // Financials
  estimatedRevenue: number; // Monthly $
  estimatedCost: number; // Content creation cost
  roiEstimate: number; // Expected ROI multiplier
  timeToRevenue: number; // Weeks

  // Confidence
  confidence: number; // 0-1 data quality

  calculatedAt: Date;
}

/** Input data for convergence detection (replaces Prisma queries). */
export interface ConvergenceInput {
  categoryId: string;
  categoryName: string;

  // Latest trend data (the three forces)
  demandScore: number;
  commissionScore: number;
  authorityScore: number;
  trendDataQuality: number; // 0-1

  // Competition data
  competitorCount: number;
  contentVolume: number;
  averageContentQuality: number; // 0-100

  // Trend history (recent convergence scores, newest first)
  recentConvergenceScores: number[]; // last 14+ days
  sampleSize: number;
}

// ============================================================================
// CORE CONVERGENCE FORMULA
// ============================================================================

/**
 * Calculate convergence score.
 * Formula: (demand x commission x authority) / 10000 - (competition / 2)
 *
 * With perfect scores and no competition: (100*100*100)/10000 - 0 = 100
 * With perfect scores and max competition: 100 - 50 = 50
 */
export function calculateConvergenceScore(
  demand: number,
  commission: number,
  authority: number,
  competition: number,
): number {
  const forcesProduct = (demand * commission * authority) / 10000;
  const competitionPenalty = competition / 2;
  const convergence = forcesProduct - competitionPenalty;
  return Math.max(0, Math.min(100, convergence));
}

// ============================================================================
// COMPETITION ANALYSIS
// ============================================================================

/**
 * Analyze competition in a category from provided data.
 */
export function analyzeCompetition(input: {
  competitorCount: number;
  contentVolume: number;
  averageContentQuality: number;
}): {
  competitionScore: number;
  competitorCount: number;
  contentVolume: number;
  barrierToEntry: number;
  dataQuality: number;
} {
  const { competitorCount, contentVolume, averageContentQuality } = input;

  // Competition score (0-100): more competitors + more content = higher
  const competitorScore = Math.min((competitorCount / 50) * 100, 100);
  const volumeScore = Math.min((contentVolume / 500) * 100, 100);
  const competitionScore = competitorScore * 0.6 + volumeScore * 0.4;

  // Barrier to entry: high competition + high quality = high barrier
  const barrierToEntry = competitionScore * 0.5 + averageContentQuality * 0.5;

  return {
    competitionScore,
    competitorCount,
    contentVolume,
    barrierToEntry,
    dataQuality: contentVolume > 10 ? 1.0 : contentVolume / 10,
  };
}

// ============================================================================
// TREND ANALYSIS
// ============================================================================

/**
 * Analyze trend direction from a series of convergence scores.
 * Expects scores ordered newest-first.
 */
export function analyzeTrendDirection(recentScores: number[]): {
  direction: "emerging" | "rising" | "stable" | "declining" | "dying";
  velocity: number;
  sampleSize: number;
} {
  if (recentScores.length < 7) {
    return { direction: "stable", velocity: 0, sampleSize: recentScores.length };
  }

  // Reverse to get oldest-first for calculation
  const ordered = [...recentScores].reverse();

  // Recent 7 days average (end of array = most recent)
  const recentSlice = ordered.slice(-7);
  const recentAvg =
    recentSlice.reduce((s, v) => s + v, 0) / recentSlice.length;

  // Previous 7 days average
  const previousSlice = ordered.slice(-14, -7);
  const previousAvg =
    previousSlice.length > 0
      ? previousSlice.reduce((s, v) => s + v, 0) / previousSlice.length
      : recentAvg;

  // Velocity: % change per week
  const velocity =
    previousAvg > 0 ? ((recentAvg - previousAvg) / previousAvg) * 100 : 0;

  let direction: "emerging" | "rising" | "stable" | "declining" | "dying";
  if (velocity > 20) direction = "emerging";
  else if (velocity > 5) direction = "rising";
  else if (velocity > -5) direction = "stable";
  else if (velocity > -20) direction = "declining";
  else direction = "dying";

  return { direction, velocity, sampleSize: recentScores.length };
}

// ============================================================================
// OPPORTUNITY ANALYSIS
// ============================================================================

/**
 * Generate opportunity analysis and recommendations.
 */
export function generateOpportunityAnalysis(params: {
  convergenceScore: number;
  demandScore: number;
  commissionScore: number;
  authorityScore: number;
  competitionScore: number;
  trendDirection: string;
  velocityScore: number;
}): {
  opportunityScore: number;
  priority: "critical" | "high" | "medium" | "low" | "avoid";
  recommendation:
    | "invest_now"
    | "watch_closely"
    | "test_small"
    | "partner_first"
    | "skip";
  estimatedRevenue: number;
  estimatedCost: number;
  roiEstimate: number;
  timeToRevenue: number;
} {
  const {
    convergenceScore,
    demandScore,
    commissionScore,
    authorityScore,
    competitionScore,
    trendDirection,
  } = params;

  // Opportunity score: convergence (50%) + trend (30%) + low competition (20%)
  const trendBonus =
    trendDirection === "emerging" ? 20 : trendDirection === "rising" ? 10 : 0;
  const competitionBonus = (100 - competitionScore) * 0.2;
  const opportunityScore = Math.min(
    convergenceScore * 0.5 + trendBonus + competitionBonus,
    100,
  );

  // Priority (adjusted for internal-only data: lower thresholds)
  let priority: "critical" | "high" | "medium" | "low" | "avoid";
  if (opportunityScore >= 35) priority = "critical";
  else if (opportunityScore >= 30) priority = "high";
  else if (opportunityScore >= 25) priority = "medium";
  else if (opportunityScore >= 20) priority = "low";
  else priority = "avoid";

  // Recommendation (adjusted for internal-only data)
  let recommendation:
    | "invest_now"
    | "watch_closely"
    | "test_small"
    | "partner_first"
    | "skip";
  if (convergenceScore >= 25 && trendDirection === "emerging") {
    recommendation = "invest_now";
  } else if (convergenceScore >= 20 && authorityScore < 50) {
    recommendation = "partner_first";
  } else if (convergenceScore >= 15) {
    recommendation = "test_small";
  } else if (convergenceScore >= 10) {
    recommendation = "watch_closely";
  } else {
    recommendation = "skip";
  }

  // Financial estimates
  const financials = estimateFinancials({
    demandScore,
    commissionScore,
    competition: competitionScore,
    contentVolume: 0,
  });

  return {
    opportunityScore,
    priority,
    recommendation,
    ...financials,
  };
}

/**
 * Estimate financial projections.
 */
function estimateFinancials(params: {
  demandScore: number;
  commissionScore: number;
  competition: number;
  contentVolume: number;
}): {
  estimatedRevenue: number;
  estimatedCost: number;
  roiEstimate: number;
  timeToRevenue: number;
} {
  const baseRevenue = (params.demandScore * params.commissionScore) / 100;
  const competitionFactor = (100 - params.competition) / 100;
  const estimatedRevenue = Math.round(baseRevenue * competitionFactor * 15);
  const qualityMultiplier = 1 + params.competition / 100;
  const estimatedCost = Math.round(300 * qualityMultiplier);
  const roiEstimate =
    estimatedCost > 0
      ? Number((estimatedRevenue / estimatedCost).toFixed(1))
      : 0;
  const timeToRevenue =
    params.competition > 70 ? 8 : params.competition > 50 ? 5 : 3;

  return { estimatedRevenue, estimatedCost, roiEstimate, timeToRevenue };
}

// ============================================================================
// CONFIDENCE
// ============================================================================

/**
 * Calculate confidence in convergence data.
 */
export function calculateConvergenceConfidence(
  trendDataQuality: number,
  competitionDataQuality: number,
  sampleSize: number,
): number {
  const sampleFactor = Math.min(sampleSize / 7, 1);
  const avgQuality = (trendDataQuality + competitionDataQuality) / 2;
  return avgQuality * sampleFactor;
}

// ============================================================================
// REASONING
// ============================================================================

/**
 * Generate human-readable reasoning for a recommendation.
 */
export function generateReasoning(signals: ConvergenceSignals): string {
  const reasons: string[] = [];

  if (signals.demandScore >= 75) {
    reasons.push(`Strong consumer demand (${signals.demandScore}/100)`);
  } else if (signals.demandScore >= 60) {
    reasons.push(`Moderate demand (${signals.demandScore}/100)`);
  } else {
    reasons.push(`Low demand (${signals.demandScore}/100)`);
  }

  if (signals.commissionScore >= 70) reasons.push("excellent profit margins");
  else if (signals.commissionScore >= 50) reasons.push("decent profit margins");
  else reasons.push("low profit margins");

  if (signals.authorityScore >= 70)
    reasons.push("authoritative creators present");
  else if (signals.authorityScore >= 50)
    reasons.push("some authority established");
  else reasons.push("authority gap - partnership opportunity");

  if (signals.competitionScore < 40) reasons.push("low competition");
  else if (signals.competitionScore < 70) reasons.push("moderate competition");
  else reasons.push("high competition");

  if (signals.trendDirection === "emerging") {
    reasons.push(`rapid growth (+${signals.velocityScore.toFixed(1)}%)`);
  } else if (signals.trendDirection === "rising") {
    reasons.push(`steady growth (+${signals.velocityScore.toFixed(1)}%)`);
  } else if (signals.trendDirection === "declining") {
    reasons.push(`declining trend (${signals.velocityScore.toFixed(1)}%)`);
  }

  const labels: Record<string, string> = {
    invest_now: "GREEN LIGHT",
    partner_first: "PARTNER FIRST",
    test_small: "TEST SMALL",
    watch_closely: "WATCH CLOSELY",
    skip: "SKIP",
  };

  return `${labels[signals.recommendation] ?? "UNKNOWN"}: ${reasons.join(", ")}.`;
}

// ============================================================================
// FULL DETECTION (orchestrates the above)
// ============================================================================

/**
 * Detect convergence from pre-fetched data.
 * This is the standalone version that takes all data as input
 * instead of querying a database.
 */
export function detectConvergence(
  input: ConvergenceInput,
  logger: Logger = defaultLogger,
): ConvergenceSignals {
  logger.info(`Detecting convergence for category: ${input.categoryId}`);

  // Analyze competition
  const competition = analyzeCompetition({
    competitorCount: input.competitorCount,
    contentVolume: input.contentVolume,
    averageContentQuality: input.averageContentQuality,
  });

  // Calculate convergence score
  const convergence = calculateConvergenceScore(
    input.demandScore,
    input.commissionScore,
    input.authorityScore,
    competition.competitionScore,
  );

  // Analyze trend
  const trendAnalysis = analyzeTrendDirection(input.recentConvergenceScores);

  // Generate opportunity analysis
  const opportunity = generateOpportunityAnalysis({
    convergenceScore: convergence,
    demandScore: input.demandScore,
    commissionScore: input.commissionScore,
    authorityScore: input.authorityScore,
    competitionScore: competition.competitionScore,
    trendDirection: trendAnalysis.direction,
    velocityScore: trendAnalysis.velocity,
  });

  // Calculate confidence
  const confidence = calculateConvergenceConfidence(
    input.trendDataQuality,
    competition.dataQuality,
    trendAnalysis.sampleSize,
  );

  return {
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    demandScore: input.demandScore,
    commissionScore: input.commissionScore,
    authorityScore: input.authorityScore,
    competitionScore: competition.competitionScore,
    competitorCount: competition.competitorCount,
    contentVolume: competition.contentVolume,
    barrierToEntry: competition.barrierToEntry,
    convergenceScore: convergence,
    trendDirection: trendAnalysis.direction,
    velocityScore: trendAnalysis.velocity,
    opportunityScore: opportunity.opportunityScore,
    priority: opportunity.priority,
    recommendation: opportunity.recommendation,
    estimatedRevenue: opportunity.estimatedRevenue,
    estimatedCost: opportunity.estimatedCost,
    roiEstimate: opportunity.roiEstimate,
    timeToRevenue: opportunity.timeToRevenue,
    confidence,
    calculatedAt: new Date(),
  };
}
