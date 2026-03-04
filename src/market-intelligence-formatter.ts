/**
 * Market Intelligence Response Formatter -- Layer 2 Tools
 *
 * Shapes raw market intelligence output into MCP response schemas for the
 * 6 Layer 2 tools:
 *
 * 1. discover_opportunities -- convergence scoring with investment recommendations
 * 2. scan_affiliate_programs -- affiliate program details with commission rates
 * 3. assess_channel_authority -- 5-dimension channel scoring
 * 4. map_category_affinity -- cross-category relationship graph
 * 5. track_category_lifecycle -- category state machine with transition signals
 * 6. get_seasonal_calendar -- region-specific commerce events with demand multipliers
 *
 * All functions are pure (no side effects) and handle missing/partial data
 * gracefully -- if upstream data is incomplete, fields are populated with
 * sensible defaults.
 */

import type { ConvergenceSignals } from "./market-intelligence/convergence-detector.js";
import type { DiscoveredProgram } from "./market-intelligence/awin-scanner.js";
import type {
  VettingResult,
  CriterionResult,
} from "./market-intelligence/channel-vetting.js";
import type { AffinityResult } from "./market-intelligence/affinity-calculator.js";
import type { LifecycleStage } from "./market-intelligence/category-lifecycle.js";
import type {
  DefaultPromotionTemplate,
  PromotionRegion,
} from "./market-intelligence/commerce-calendar.js";

// ============================================================================
// INPUT TYPES -- Raw data shapes from the market intelligence modules
// ============================================================================

/**
 * Input data for opportunity discovery formatting.
 * Produced by the convergence detector + internal intelligence.
 */
export interface OpportunityData {
  /** The convergence signals for a single category. */
  signals: ConvergenceSignals;
  /** The vertical this opportunity belongs to (e.g. "gardening"). */
  vertical?: string;
}

/**
 * Input data for affiliate program formatting.
 * Produced by the Awin scanner (or other affiliate network scanners).
 */
export interface AffiliateProgramData {
  /** Discovered programs from the scanner. */
  programs: DiscoveredProgram[];
  /** The category/vertical these programs were scanned for. */
  category: string;
}

/**
 * Input data for channel authority formatting.
 * Produced by the channel vetting system.
 */
export interface ChannelAuthorityData {
  /** The channel being evaluated. */
  channel: {
    channelId: string;
    channelName: string;
    subscriberCount?: number | null;
    videoCount?: number | null;
    yearsActive?: number;
  };
  /** The vetting result with per-criterion scores. */
  vettingResult: VettingResult;
}

/**
 * Input data for category affinity formatting.
 * Produced by the affinity calculator.
 */
export interface CategoryAffinityData {
  /** The source category being analyzed. */
  category: string;
  /** Pairwise affinity results with related categories. */
  affinities: Array<{
    relatedCategoryName: string;
    result: AffinityResult;
  }>;
  /** Optional expansion paths computed from affinity chains. */
  expansionPaths?: Array<{
    path: string[];
    viabilityScore: number;
  }>;
}

/**
 * Input data for category lifecycle formatting.
 * Produced by the lifecycle manager.
 */
export interface CategoryLifecycleData {
  category: string;
  currentStage: LifecycleStage;
  /** Confidence in the current stage assignment (0-1). */
  stageConfidence: number;
  /** Signals that inform the current lifecycle state. */
  signals: Array<{
    signal: string;
    direction: "positive" | "negative";
    strength: number;
  }>;
  /** Predicted next state transition. */
  transition?: {
    nextState: string;
    probability: number;
    estimatedTimeframe: string;
  };
}

/**
 * Input data for seasonal calendar formatting.
 * Produced by the commerce calendar module.
 */
export interface SeasonalCalendarData {
  region: PromotionRegion | string;
  currentSeason: string;
  events: Array<{
    template: DefaultPromotionTemplate;
    /** Demand multiplier for this event (1.0 = baseline). */
    demandMultiplier: number;
    /** Commerce tip for this event period. */
    commerceTip?: string;
  }>;
}

// ============================================================================
// RESPONSE TYPES -- The output shapes returned to MCP clients
// ============================================================================

export interface OpportunitiesResponse {
  opportunities: Array<{
    category: string;
    convergence_score: number;
    recommendation:
      | "invest_now"
      | "watch_closely"
      | "test_small"
      | "partner_first"
      | "skip";
    demand_score: number;
    commission_score: number;
    authority_score: number;
    competition_level: number;
    reasoning: string;
  }>;
  vertical: string;
  analyzed_at: string;
}

export interface AffiliateProgramsResponse {
  programs: Array<{
    network: string;
    program_name: string;
    merchant: string;
    commission_rate: string;
    cookie_duration_days: number;
    category_match_score: number;
    status: string;
  }>;
  total_found: number;
  category: string;
}

export interface ChannelAuthorityResponse {
  channel_id: string;
  channel_name: string;
  overall_score: number;
  dimensions: {
    reach: { score: number; subscribers: number; avg_views: number };
    engagement: { score: number; like_ratio: number; comment_rate: number };
    quality: {
      score: number;
      editorial_tier: string;
      botanical_literacy: number;
    };
    trust: { score: number; verified: boolean; years_active: number };
    commercial: {
      score: number;
      affiliate_ready: boolean;
      sponsorship_fit: number;
    };
  };
  recommendation: string;
}

export interface CategoryAffinityResponse {
  category: string;
  related_categories: Array<{
    name: string;
    affinity_score: number;
    relationship_type: "overlapping" | "complementary" | "adjacent";
    shared_audience_pct: number;
    cross_sell_potential: number;
  }>;
  expansion_paths: Array<{
    path: string[];
    viability_score: number;
  }>;
}

export interface CategoryLifecycleResponse {
  category: string;
  current_state: "emerging" | "growing" | "mature" | "declining";
  state_confidence: number;
  signals: Array<{
    signal: string;
    direction: "positive" | "negative";
    strength: number;
  }>;
  transition_probability: {
    next_state: string;
    probability: number;
    estimated_timeframe: string;
  };
}

export interface SeasonalCalendarResponse {
  region: string;
  events: Array<{
    name: string;
    start_date: string;
    end_date: string;
    demand_multiplier: number;
    categories_affected: string[];
    commerce_tip: string;
  }>;
  current_season: string;
  next_peak_event: string;
}

// ============================================================================
// FORMATTER: discover_opportunities
// ============================================================================

/**
 * Format convergence detection results into the `discover_opportunities`
 * MCP response.
 *
 * Each opportunity is scored on convergence (demand x commission x authority)
 * and given an actionable recommendation: invest_now, watch_closely,
 * test_small, partner_first, or skip.
 *
 * Opportunities are sorted by convergence score descending.
 */
export function formatOpportunitiesResponse(
  opportunities: OpportunityData[],
  vertical: string = "gardening",
): OpportunitiesResponse {
  const formatted = opportunities
    .map((opp) => {
      const s = opp.signals;
      return {
        category: s.categoryName || s.categoryId || "unknown",
        convergence_score: roundTo(s.convergenceScore, 1),
        recommendation: s.recommendation,
        demand_score: roundTo(s.demandScore, 1),
        commission_score: roundTo(s.commissionScore, 1),
        authority_score: roundTo(s.authorityScore, 1),
        competition_level: roundTo(s.competitionScore, 1),
        reasoning: buildOpportunityReasoning(s),
      };
    })
    .sort((a, b) => b.convergence_score - a.convergence_score);

  return {
    opportunities: formatted,
    vertical,
    analyzed_at: new Date().toISOString(),
  };
}

/**
 * Build a human-readable reasoning string from convergence signals.
 * Falls back to a generic description if signals are incomplete.
 */
function buildOpportunityReasoning(signals: ConvergenceSignals): string {
  const parts: string[] = [];

  // Demand assessment
  if (signals.demandScore >= 75) {
    parts.push(`strong demand (${signals.demandScore}/100)`);
  } else if (signals.demandScore >= 50) {
    parts.push(`moderate demand (${signals.demandScore}/100)`);
  } else {
    parts.push(`low demand (${signals.demandScore}/100)`);
  }

  // Commission assessment
  if (signals.commissionScore >= 70) {
    parts.push("excellent margins");
  } else if (signals.commissionScore >= 50) {
    parts.push("decent margins");
  } else {
    parts.push("low margins");
  }

  // Competition assessment
  if (signals.competitionScore < 40) {
    parts.push("low competition");
  } else if (signals.competitionScore < 70) {
    parts.push("moderate competition");
  } else {
    parts.push("high competition");
  }

  // Trend
  if (signals.trendDirection === "emerging" || signals.trendDirection === "rising") {
    parts.push(
      `${signals.trendDirection} trend (+${roundTo(signals.velocityScore, 1)}%)`,
    );
  } else if (
    signals.trendDirection === "declining" ||
    signals.trendDirection === "dying"
  ) {
    parts.push(
      `${signals.trendDirection} trend (${roundTo(signals.velocityScore, 1)}%)`,
    );
  }

  if (parts.length === 0) {
    return "Insufficient data for detailed reasoning.";
  }

  const labels: Record<string, string> = {
    invest_now: "INVEST NOW",
    partner_first: "PARTNER FIRST",
    test_small: "TEST SMALL",
    watch_closely: "WATCH CLOSELY",
    skip: "SKIP",
  };

  const label = labels[signals.recommendation] ?? "EVALUATE";
  return `${label}: ${parts.join(", ")}.`;
}

// ============================================================================
// FORMATTER: scan_affiliate_programs
// ============================================================================

/**
 * Format discovered affiliate programs into the `scan_affiliate_programs`
 * MCP response.
 *
 * Programs are sorted by relevance score descending.
 * Commission rates are formatted as human-readable strings (e.g. "3-8%").
 */
export function formatAffiliateProgramsResponse(
  data: AffiliateProgramData,
): AffiliateProgramsResponse {
  const formatted = data.programs
    .map((prog) => ({
      network: "Awin", // Currently only Awin is supported
      program_name: prog.advertiserName,
      merchant: prog.advertiserName,
      commission_rate: formatCommissionRate(prog.commission.min, prog.commission.max),
      cookie_duration_days: prog.cookieDuration || 30,
      category_match_score: roundTo(prog.relevanceScore, 1),
      status: prog.relevanceScore >= 70 ? "recommended" : "available",
    }))
    .sort((a, b) => b.category_match_score - a.category_match_score);

  return {
    programs: formatted,
    total_found: formatted.length,
    category: data.category,
  };
}

/**
 * Format min/max commission into a human-readable rate string.
 */
function formatCommissionRate(min: number, max: number): string {
  if (min <= 0 && max <= 0) return "varies";
  if (min === max) return `${roundTo(min, 1)}%`;
  if (min <= 0) return `up to ${roundTo(max, 1)}%`;
  return `${roundTo(min, 1)}-${roundTo(max, 1)}%`;
}

// ============================================================================
// FORMATTER: assess_channel_authority
// ============================================================================

/**
 * Map criterion IDs to the 5 MCP-facing dimensions.
 *
 * The vetting system uses 7 criteria internally. We consolidate them
 * into 5 dimensions for the MCP response:
 *
 * - reach: media_presence
 * - engagement: production_quality
 * - quality: editorial_vetting, published_books
 * - trust: professional_credentials, institutional_affiliation
 * - commercial: ethical_alignment (proxy for commercial fit)
 */
const CRITERION_TO_DIMENSION: Record<string, string> = {
  media_presence: "reach",
  production_quality: "engagement",
  editorial_vetting: "quality",
  published_books: "quality",
  professional_credentials: "trust",
  institutional_affiliation: "trust",
  ethical_alignment: "commercial",
};

/**
 * Format channel vetting results into the `assess_channel_authority`
 * MCP response.
 *
 * The 7 internal criteria are consolidated into 5 consumer-facing
 * dimensions (reach, engagement, quality, trust, commercial).
 * Scores are normalized to 0-100 per dimension.
 */
export function formatChannelAuthorityResponse(
  data: ChannelAuthorityData,
): ChannelAuthorityResponse {
  const { channel, vettingResult } = data;

  // Group criteria results by dimension
  const dimensionScores = groupByDimension(vettingResult.criteriaResults);

  // Build the 5 dimensions with defaults for missing data
  const reachScores = dimensionScores.get("reach") ?? [];
  const engagementScores = dimensionScores.get("engagement") ?? [];
  const qualityScores = dimensionScores.get("quality") ?? [];
  const trustScores = dimensionScores.get("trust") ?? [];
  const commercialScores = dimensionScores.get("commercial") ?? [];

  const reachScore = averageScore(reachScores);
  const engagementScore = averageScore(engagementScores);
  const qualityScore = averageScore(qualityScores);
  const trustScore = averageScore(trustScores);
  const commercialScore = averageScore(commercialScores);

  // Derive editorial tier from quality score
  const editorialTier =
    qualityScore >= 70 ? "FEATURED" : qualityScore >= 50 ? "SUPPORTING" : "ARCHIVE";

  // Determine recommendation
  const recommendation = buildChannelRecommendation(
    vettingResult.score,
    vettingResult.decision,
    vettingResult.confidence,
  );

  return {
    channel_id: channel.channelId,
    channel_name: channel.channelName,
    overall_score: roundTo(vettingResult.score, 0),
    dimensions: {
      reach: {
        score: roundTo(reachScore, 0),
        subscribers: channel.subscriberCount ?? 0,
        avg_views: 0, // Not tracked at this level
      },
      engagement: {
        score: roundTo(engagementScore, 0),
        like_ratio: 0, // Not tracked at this level
        comment_rate: 0, // Not tracked at this level
      },
      quality: {
        score: roundTo(qualityScore, 0),
        editorial_tier: editorialTier,
        botanical_literacy: roundTo(qualityScore, 0), // Proxy
      },
      trust: {
        score: roundTo(trustScore, 0),
        verified: vettingResult.decision === "approved",
        years_active: channel.yearsActive ?? 0,
      },
      commercial: {
        score: roundTo(commercialScore, 0),
        affiliate_ready: commercialScore >= 50,
        sponsorship_fit: roundTo(commercialScore, 0),
      },
    },
    recommendation,
  };
}

/**
 * Group criterion results by their mapped MCP dimension.
 */
function groupByDimension(
  criteria: CriterionResult[],
): Map<string, CriterionResult[]> {
  const groups = new Map<string, CriterionResult[]>();
  for (const criterion of criteria) {
    const dimension =
      CRITERION_TO_DIMENSION[criterion.criterionId] ?? "quality";
    const existing = groups.get(dimension) ?? [];
    existing.push(criterion);
    groups.set(dimension, existing);
  }
  return groups;
}

/**
 * Calculate average score from a group of criterion results.
 * Returns 0 if no results are available.
 */
function averageScore(criteria: CriterionResult[]): number {
  if (criteria.length === 0) return 0;
  return criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length;
}

/**
 * Build a human-readable recommendation for a channel.
 */
function buildChannelRecommendation(
  score: number,
  decision: string,
  confidence: number,
): string {
  if (decision === "approved" && score >= 70) {
    return `Approved with high confidence (${roundTo(confidence * 100, 0)}%). Strong authority across multiple dimensions. Recommended for featured content and affiliate partnerships.`;
  }
  if (decision === "approved") {
    return `Approved (${roundTo(confidence * 100, 0)}% confidence). Meets quality thresholds. Suitable for standard content inclusion.`;
  }
  if (decision === "needs_review") {
    return `Requires human review (${roundTo(confidence * 100, 0)}% confidence). Score is ${roundTo(score, 0)}/100 -- borderline or conflicting signals detected.`;
  }
  return `Not recommended (score ${roundTo(score, 0)}/100). Authority signals are insufficient for content partnerships.`;
}

// ============================================================================
// FORMATTER: map_category_affinity
// ============================================================================

/**
 * Format affinity calculation results into the `map_category_affinity`
 * MCP response.
 *
 * Translates internal relationship types (parent_child, sibling, adjacent,
 * unrelated) into MCP-facing types (overlapping, complementary, adjacent).
 * Related categories are sorted by affinity score descending.
 */
export function formatCategoryAffinityResponse(
  data: CategoryAffinityData,
): CategoryAffinityResponse {
  const relatedCategories = data.affinities
    .filter((a) => a.result.relationshipType !== "unrelated")
    .map((a) => ({
      name: a.relatedCategoryName,
      affinity_score: roundTo(a.result.affinityScore, 2),
      relationship_type: mapRelationshipType(a.result.relationshipType),
      shared_audience_pct: roundTo(a.result.audienceOverlap ?? 0, 1),
      cross_sell_potential: roundTo(
        calculateCrossSellPotential(a.result),
        2,
      ),
    }))
    .sort((a, b) => b.affinity_score - a.affinity_score);

  const expansionPaths = (data.expansionPaths ?? []).map((ep) => ({
    path: ep.path,
    viability_score: roundTo(ep.viabilityScore, 2),
  }));

  return {
    category: data.category,
    related_categories: relatedCategories,
    expansion_paths: expansionPaths,
  };
}

/**
 * Map internal relationship types to MCP-facing types.
 *
 * - parent_child, sibling -> "overlapping" (high shared content)
 * - adjacent -> "adjacent" (moderate relationship)
 * - Everything else -> "complementary" (could pair well)
 */
function mapRelationshipType(
  internalType: "parent_child" | "sibling" | "adjacent" | "unrelated",
): "overlapping" | "complementary" | "adjacent" {
  switch (internalType) {
    case "parent_child":
    case "sibling":
      return "overlapping";
    case "adjacent":
      return "adjacent";
    default:
      return "complementary";
  }
}

/**
 * Calculate cross-sell potential from affinity result.
 *
 * Cross-sell potential is high when:
 * - Commerce overlap is significant (products bridge both categories)
 * - Audience overlap exists (same viewers interested in both)
 * - Keyword overlap is moderate (related but not identical)
 */
function calculateCrossSellPotential(result: AffinityResult): number {
  const commerceWeight = 0.4;
  const audienceWeight = 0.35;
  const keywordWeight = 0.25;

  const commerceComponent = (result.commerceOverlap / 100) * commerceWeight;
  const audienceComponent =
    ((result.audienceOverlap ?? 0) / 100) * audienceWeight;
  // Moderate keyword overlap (30-70%) is best for cross-sell
  const keywordPeak =
    1 - Math.abs(result.keywordOverlap - 50) / 50;
  const keywordComponent = keywordPeak * keywordWeight;

  return Math.min(1, commerceComponent + audienceComponent + keywordComponent);
}

// ============================================================================
// FORMATTER: track_category_lifecycle
// ============================================================================

/**
 * Map internal lifecycle stages to the 4 MCP-facing states.
 *
 * Internal stages:
 *   detected, trend_validated -> "emerging"
 *   keywords_learned, ready_for_promotion -> "growing"
 *   promoted -> "mature"
 *   retired -> "declining"
 */
const STAGE_TO_STATE: Record<
  LifecycleStage,
  "emerging" | "growing" | "mature" | "declining"
> = {
  detected: "emerging",
  trend_validated: "emerging",
  keywords_learned: "growing",
  ready_for_promotion: "growing",
  promoted: "mature",
  retired: "declining",
};

/**
 * Format category lifecycle data into the `track_category_lifecycle`
 * MCP response.
 *
 * Maps the 6-stage internal lifecycle to 4 consumer-facing states
 * and includes transition predictions where available.
 */
export function formatCategoryLifecycleResponse(
  data: CategoryLifecycleData,
): CategoryLifecycleResponse {
  const currentState = STAGE_TO_STATE[data.currentStage] ?? "emerging";

  // Determine the next likely state if not provided
  const transition = data.transition ?? inferTransition(currentState);

  return {
    category: data.category,
    current_state: currentState,
    state_confidence: roundTo(data.stageConfidence, 2),
    signals: data.signals.map((s) => ({
      signal: s.signal,
      direction: s.direction,
      strength: roundTo(s.strength, 2),
    })),
    transition_probability: {
      next_state: transition.nextState,
      probability: roundTo(transition.probability, 2),
      estimated_timeframe: transition.estimatedTimeframe,
    },
  };
}

/**
 * Infer a default transition when explicit prediction is unavailable.
 */
function inferTransition(
  currentState: "emerging" | "growing" | "mature" | "declining",
): { nextState: string; probability: number; estimatedTimeframe: string } {
  switch (currentState) {
    case "emerging":
      return {
        nextState: "growing",
        probability: 0.6,
        estimatedTimeframe: "4-8 weeks",
      };
    case "growing":
      return {
        nextState: "mature",
        probability: 0.5,
        estimatedTimeframe: "8-16 weeks",
      };
    case "mature":
      return {
        nextState: "declining",
        probability: 0.3,
        estimatedTimeframe: "6-12 months",
      };
    case "declining":
      return {
        nextState: "retired",
        probability: 0.7,
        estimatedTimeframe: "4-12 weeks",
      };
  }
}

// ============================================================================
// FORMATTER: get_seasonal_calendar
// ============================================================================

/**
 * Format seasonal calendar data into the `get_seasonal_calendar`
 * MCP response.
 *
 * Builds date strings from the DefaultPromotionTemplate month/day fields
 * and identifies the next upcoming peak event.
 */
export function formatSeasonalCalendarResponse(
  data: SeasonalCalendarData,
): SeasonalCalendarResponse {
  const now = new Date();
  const currentYear = now.getFullYear();

  const events = data.events.map((evt) => {
    const startDate = new Date(
      currentYear,
      evt.template.monthStart,
      evt.template.dayStart,
    );
    const endDate = new Date(
      currentYear,
      evt.template.monthEnd,
      evt.template.dayEnd,
      23,
      59,
      59,
    );

    // Handle year-boundary promotions
    if (evt.template.monthEnd < evt.template.monthStart) {
      endDate.setFullYear(currentYear + 1);
    }

    return {
      name: evt.template.title,
      start_date: startDate.toISOString().split("T")[0]!,
      end_date: endDate.toISOString().split("T")[0]!,
      demand_multiplier: roundTo(evt.demandMultiplier, 2),
      categories_affected: evt.template.categories ?? [],
      commerce_tip:
        evt.commerceTip ??
        buildDefaultCommerceTip(evt.template.title, evt.template.categories),
    };
  });

  // Find the next peak event (highest demand multiplier in the future)
  const futureEvents = events.filter(
    (e) => new Date(e.end_date) >= now,
  );
  const nextPeak = futureEvents.length > 0
    ? futureEvents.reduce((best, e) =>
        e.demand_multiplier > best.demand_multiplier ? e : best,
      ).name
    : "none upcoming";

  return {
    region: data.region,
    events,
    current_season: data.currentSeason,
    next_peak_event: nextPeak,
  };
}

/**
 * Build a default commerce tip from event name and categories.
 */
function buildDefaultCommerceTip(
  eventName: string,
  categories?: string[],
): string {
  if (categories && categories.length > 0) {
    const cats = categories.slice(0, 3).join(", ");
    return `Stock ${cats.toLowerCase()} during ${eventName.toLowerCase()} for maximum conversion.`;
  }
  return `Align promotions with ${eventName.toLowerCase()} for seasonal demand uplift.`;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Round a number to a given number of decimal places.
 */
function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
