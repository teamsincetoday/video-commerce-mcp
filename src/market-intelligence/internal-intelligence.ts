/**
 * Internal Intelligence Service
 *
 * Uses ONLY internal data to generate intelligence insights for:
 * - Demand scoring (keywords, video frequency, commerce items, views)
 * - Commission scoring (affiliate programs, product availability, link density)
 * - Authority scoring (creator metrics, content quality, consistency)
 * - Convergence calculation (three forces combined)
 *
 * No external API calls required.
 *
 * Ported from monolith: lib/services/category-intelligence/internal-intelligence.ts
 * Removed: Prisma queries. All data provided via input interfaces.
 */

import type { Logger } from "../types.js";
import { defaultLogger } from "../types.js";

// ============================================================================
// TYPES
// ============================================================================

export interface InternalDemandSignals {
  demandScore: number;
  confidence: number;
  signals: {
    keywordMatches: number;
    videoMentions: number;
    commerceItems: number;
    totalViews: number;
    recentTrend: "rising" | "stable" | "declining";
  };
  breakdown: {
    keywordScore: number;
    videoFrequencyScore: number;
    commerceScore: number;
    viewsScore: number;
  };
}

export interface InternalCommissionSignals {
  commissionScore: number;
  confidence: number;
  signals: {
    affiliatePrograms: number;
    avgCommissionRate: number;
    productAvailability: number;
    affiliateLinkCount: number;
  };
  breakdown: {
    availabilityScore: number;
    commissionRateScore: number;
    linkDensityScore: number;
  };
}

export interface InternalAuthoritySignals {
  authorityScore: number;
  confidence: number;
  signals: {
    topCreators: Array<{
      channelId: string;
      channelName: string;
      subscriberCount: number;
      videoCount: number;
      avgViews: number;
      contentQuality: number;
    }>;
    totalVideos: number;
    avgQuality: number;
  };
  breakdown: {
    creatorCountScore: number;
    contentQualityScore: number;
    consistencyScore: number;
  };
}

/**
 * Pre-aggregated data for demand calculation.
 * This replaces the Prisma queries from the monolith.
 */
export interface DemandData {
  /** Total keyword match count across all matched keywords. */
  totalKeywordMatches: number;
  /** Average keyword weight. */
  avgKeywordWeight: number;
  /** Number of processed videos mentioning the category. */
  videoMentions: number;
  /** Number of commerce items matching the category. */
  commerceItems: number;
  /** Total views across related videos. */
  totalViews: number;
  /** Average views per video. */
  avgViewsPerVideo: number;
  /** Total processed videos in the system (for normalization). */
  totalProcessedVideos: number;
  /** Total commerce items in the system (for normalization). */
  totalCommerceItems: number;
  /** Average views of recent videos (last 30 days). */
  recentAvgViews: number;
  /** Average views of older videos (before 30 days). */
  olderAvgViews: number;
}

/**
 * Pre-aggregated data for commission calculation.
 */
export interface CommissionData {
  /** Number of relevant affiliate programs. */
  relevantAffiliateCount: number;
  /** Estimated average commission rate (%). */
  estimatedCommissionRate: number;
  /** Number of products available for this category. */
  availableProducts: number;
  /** Total products in the system (for normalization). */
  totalProducts: number;
  /** Number of affiliate links in content for this category. */
  affiliateLinkCount: number;
  /** Total entity links in the system (for normalization). */
  totalEntityLinks: number;
}

/**
 * Pre-aggregated data for authority calculation.
 */
export interface AuthorityData {
  /** Creators covering this topic with their metrics. */
  creators: Array<{
    channelId: string;
    channelName: string;
    videoCount: number;
    totalViews: number;
    avgRating: number;
    avgEntities: number;
    avgCommerceItems: number;
  }>;
  /** Total unique channels in the system (for normalization). */
  totalUniqueChannels: number;
}

// ============================================================================
// DEMAND CALCULATION
// ============================================================================

/**
 * Calculate demand score from internal data.
 */
export function calculateInternalDemand(
  data: DemandData,
): InternalDemandSignals {
  // Keyword Score: based on match count and weight
  const keywordScore = Math.min(
    100,
    data.totalKeywordMatches * data.avgKeywordWeight * 2,
  );

  // Video Frequency Score
  const videoFrequencyScore = Math.min(
    100,
    data.totalProcessedVideos > 0
      ? (data.videoMentions / data.totalProcessedVideos) * 100
      : 0,
  );

  // Commerce Score
  const commerceScore = Math.min(
    100,
    data.totalCommerceItems > 0
      ? (data.commerceItems / data.totalCommerceItems) * 100
      : 0,
  );

  // Views Score: normalize (10k avg views = 100 score)
  const viewsScore = Math.min(100, data.avgViewsPerVideo / 100);

  // Trend detection
  let recentTrend: "rising" | "stable" | "declining" = "stable";
  if (data.recentAvgViews > data.olderAvgViews * 1.2) recentTrend = "rising";
  else if (data.recentAvgViews < data.olderAvgViews * 0.8)
    recentTrend = "declining";

  // Trend multiplier
  const trendMultiplier =
    recentTrend === "rising" ? 1.2 : recentTrend === "declining" ? 0.8 : 1.0;

  // Combined demand score (weighted average)
  const demandScore = Math.round(
    (keywordScore * 0.35 +
      videoFrequencyScore * 0.25 +
      commerceScore * 0.25 +
      viewsScore * 0.15) *
      trendMultiplier,
  );

  // Confidence: higher with more data points
  const dataPoints =
    (data.totalKeywordMatches > 0 ? 1 : 0) +
    (data.videoMentions > 0 ? 1 : 0) +
    (data.commerceItems > 0 ? 1 : 0) +
    (data.totalViews > 0 ? 1 : 0);
  const confidence = Math.min(100, (dataPoints / 4) * 100);

  return {
    demandScore: Math.min(100, Math.max(0, demandScore)),
    confidence,
    signals: {
      keywordMatches: data.totalKeywordMatches,
      videoMentions: data.videoMentions,
      commerceItems: data.commerceItems,
      totalViews: data.totalViews,
      recentTrend,
    },
    breakdown: {
      keywordScore: Math.round(keywordScore),
      videoFrequencyScore: Math.round(videoFrequencyScore),
      commerceScore: Math.round(commerceScore),
      viewsScore: Math.round(viewsScore),
    },
  };
}

// ============================================================================
// COMMISSION CALCULATION
// ============================================================================

/**
 * Calculate commission potential from internal affiliate data.
 */
export function calculateInternalCommission(
  data: CommissionData,
): InternalCommissionSignals {
  // Availability Score: do we have products to sell?
  const availabilityScore = Math.min(
    100,
    data.totalProducts > 0
      ? (data.availableProducts / data.totalProducts) * 100 * 5
      : 0,
  );

  // Commission Rate Score: fixed estimate
  const commissionRateScore = data.estimatedCommissionRate * 6;

  // Link Density Score: how well are we monetizing?
  const linkDensityScore = Math.min(
    100,
    data.totalEntityLinks > 0
      ? (data.affiliateLinkCount / data.totalEntityLinks) * 100 * 3
      : 0,
  );

  // Combined commission score
  const commissionScore = Math.round(
    availabilityScore * 0.4 +
      commissionRateScore * 0.35 +
      linkDensityScore * 0.25,
  );

  // Confidence: based on affiliate count
  const confidence = Math.min(
    100,
    (data.relevantAffiliateCount / 3) * 100,
  );

  return {
    commissionScore: Math.min(100, Math.max(0, commissionScore)),
    confidence: Math.max(50, confidence),
    signals: {
      affiliatePrograms: data.relevantAffiliateCount,
      avgCommissionRate: data.estimatedCommissionRate,
      productAvailability: data.availableProducts,
      affiliateLinkCount: data.affiliateLinkCount,
    },
    breakdown: {
      availabilityScore: Math.round(availabilityScore),
      commissionRateScore: Math.round(commissionRateScore),
      linkDensityScore: Math.round(linkDensityScore),
    },
  };
}

// ============================================================================
// AUTHORITY CALCULATION
// ============================================================================

/**
 * Calculate authority from internal channel and video data.
 */
export function calculateInternalAuthority(
  data: AuthorityData,
): InternalAuthoritySignals {
  // Build creator metrics
  const topCreators = data.creators
    .map((creator) => {
      const avgViews =
        creator.videoCount > 0 ? creator.totalViews / creator.videoCount : 0;
      const contentQuality = Math.min(
        100,
        (creator.avgEntities / 15) * 50 +
          (creator.avgCommerceItems / 8) * 50,
      );

      return {
        channelId: creator.channelId,
        channelName: creator.channelName,
        subscriberCount: 0, // Not always tracked
        videoCount: creator.videoCount,
        avgViews,
        contentQuality: Math.round(contentQuality),
      };
    })
    .sort((a, b) => b.contentQuality - a.contentQuality)
    .slice(0, 10);

  // Calculate scores
  const totalVideos = data.creators.reduce(
    (sum, c) => sum + c.videoCount,
    0,
  );
  const avgQuality =
    topCreators.length > 0
      ? topCreators.reduce((sum, c) => sum + c.contentQuality, 0) /
        topCreators.length
      : 0;

  // Creator Count Score
  const creatorCountScore = Math.min(
    100,
    data.totalUniqueChannels > 0
      ? (data.creators.length / data.totalUniqueChannels) * 100 * 3
      : 0,
  );

  // Content Quality Score
  const contentQualityScore = avgQuality;

  // Consistency Score: multiple videos from same creators = good
  const avgVideosPerCreator =
    data.creators.length > 0 ? totalVideos / data.creators.length : 0;
  const consistencyScore = Math.min(100, avgVideosPerCreator * 20);

  // Combined authority score
  const authorityScore = Math.round(
    creatorCountScore * 0.3 +
      contentQualityScore * 0.4 +
      consistencyScore * 0.3,
  );

  // Confidence: based on video count
  const confidence = Math.min(100, (totalVideos / 10) * 100);

  return {
    authorityScore: Math.min(100, Math.max(0, authorityScore)),
    confidence: Math.max(30, confidence),
    signals: {
      topCreators,
      totalVideos,
      avgQuality: Math.round(avgQuality),
    },
    breakdown: {
      creatorCountScore: Math.round(creatorCountScore),
      contentQualityScore: Math.round(contentQualityScore),
      consistencyScore: Math.round(consistencyScore),
    },
  };
}

// ============================================================================
// FULL CONVERGENCE
// ============================================================================

/**
 * Calculate convergence using internal data only.
 */
export function calculateInternalConvergence(
  demandData: DemandData,
  commissionData: CommissionData,
  authorityData: AuthorityData,
  logger: Logger = defaultLogger,
): {
  convergenceScore: number;
  demand: InternalDemandSignals;
  commission: InternalCommissionSignals;
  authority: InternalAuthoritySignals;
  confidence: number;
  trendDirection: string;
} {
  const demand = calculateInternalDemand(demandData);
  const commission = calculateInternalCommission(commissionData);
  const authority = calculateInternalAuthority(authorityData);

  logger.info("Demand analysis complete", {
    demandScore: demand.demandScore,
    confidence: demand.confidence,
  });
  logger.info("Commission analysis complete", {
    commissionScore: commission.commissionScore,
    confidence: commission.confidence,
  });
  logger.info("Authority analysis complete", {
    authorityScore: authority.authorityScore,
    confidence: authority.confidence,
  });

  // Calculate convergence: (demand x commission x authority) / 10000
  const convergenceScore =
    (demand.demandScore *
      commission.commissionScore *
      authority.authorityScore) /
    10000;
  const avgConfidence =
    (demand.confidence + commission.confidence + authority.confidence) / 3;

  // Trend direction
  let trendDirection = "stable";
  if (demand.signals.recentTrend === "rising") trendDirection = "emerging";
  else if (demand.signals.recentTrend === "declining")
    trendDirection = "declining";

  logger.info("Convergence calculated", {
    convergenceScore: Math.round(convergenceScore),
    avgConfidence: Math.round(avgConfidence),
    trendDirection,
  });

  return {
    convergenceScore: Math.round(convergenceScore),
    demand,
    commission,
    authority,
    confidence: avgConfidence,
    trendDirection,
  };
}
