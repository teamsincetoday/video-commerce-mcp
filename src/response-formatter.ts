/**
 * Response Formatter — Layer 1 Tools
 *
 * Shapes raw pipeline output into MCP response schemas for the 6 core tools:
 * 1. analyze_video — full commercial intelligence (all dimensions)
 * 2. get_commercial_entities — entities only (lightweight)
 * 3. get_monetization_opportunities — scored monetization strategies
 * 4. get_audience_insights — intent archetypes with CTAs
 * 5. discover_content_gaps — market gap analysis
 * 6. batch_analyze — multi-video analysis with cross-video comparison
 *
 * All functions are pure (no side effects) and handle missing/partial data
 * gracefully -- if a pipeline stage failed, those fields are omitted or
 * populated with safe defaults.
 */

import type { EnhancedEntity, CommerceItemCategory } from "./types.js";
import type { TranscriptIntentAnalysis, IntentDetectionResult } from "./intelligence/audience-taxonomy.js";
import type { SkillAnalysis } from "./intelligence/skill-extraction.js";
import type { EditorialQualityScore } from "./intelligence/editorial-quality.js";
import type { SeasonalContext } from "./intelligence/seasonal-context.js";
import type { PotentialScore } from "./intelligence/category-potential.js";

// ============================================================================
// ANALYSIS RESULT — The unified pipeline output
// ============================================================================

/**
 * The complete result from the PipelineOrchestrator.
 * Each field is optional because the pipeline supports partial execution
 * (focus filtering, depth control, or stage failures).
 */
export interface AnalysisResult {
  /** Video metadata */
  videoId: string;
  title: string;
  channel: string;
  durationSeconds: number;
  language: string;
  analysisTimestamp: string;
  analysisDepth: "standard" | "deep";

  /** Extracted entities with enrichment data */
  entities?: AnalysisEntity[];

  /** Audience intent analysis */
  audienceIntent?: TranscriptIntentAnalysis;

  /** Editorial quality assessment */
  quality?: EditorialQualityScore;

  /** Skill extraction */
  skills?: SkillAnalysis;

  /** Seasonal context */
  seasonalContext?: SeasonalContext;

  /** Category potential scoring */
  categoryPotential?: PotentialScore;

  /** Preprocessing metrics */
  preprocessingMetrics?: {
    originalLength: number;
    processedLength: number;
    reductionPercentage: number;
  };

  /** Pipeline metadata */
  pipelineMetadata?: {
    stagesCompleted: string[];
    stagesFailed: string[];
    totalDurationMs: number;
  };
}

/**
 * An entity as produced by the pipeline (NER + enrichment + commerce detection).
 * This is the internal representation before formatting for MCP output.
 */
export interface AnalysisEntity {
  /** Display name (common name or product name) */
  name: string;
  /** Scientific/Latin name if applicable */
  scientificName?: string;
  /** Commerce category */
  category: CommerceItemCategory;
  /** Confidence score (0-1) */
  confidence: number;
  /** Whether this entity is commercially available */
  isShoppable: boolean;
  /** Mentions with timestamps and context */
  mentions: Array<{
    timestampSeconds: number;
    context: string;
  }>;
  /** Monetization potential scores (optional, only in full analysis) */
  monetizationPotential?: {
    affiliateScore: number;
    courseRelevance?: number;
    contentGap?: number;
    reviewOpportunity?: number;
    comparisonContent?: number;
  };
  /** Original enhanced entity data for deeper processing */
  _raw?: EnhancedEntity;
}

// ============================================================================
// CONTENT GAP TYPES
// ============================================================================

/**
 * A content gap identified by market intelligence.
 */
export interface ContentGap {
  topic: string;
  demandScore: number;
  competition: number;
  opportunityScore: number;
  estimatedMonthlySearches?: number;
  trend: "rising" | "stable" | "declining" | "emerging";
  recommendation: "invest_now" | "watch_closely" | "test_small" | "skip";
  monetizationAngles?: string[];
}

// ============================================================================
// MCP RESPONSE TYPES — The output shapes returned to MCP clients
// ============================================================================

/**
 * Entity shape in the analyze_video response (with monetization potential).
 */
export interface ResponseEntity {
  name: string;
  scientific_name?: string;
  category: string;
  confidence: number;
  is_shoppable: boolean;
  mentions: Array<{
    timestamp_seconds: number;
    context: string;
  }>;
  monetization_potential?: {
    affiliate_score: number;
    course_relevance?: number;
    content_gap?: number;
    review_opportunity?: number;
    comparison_content?: number;
  };
}

/**
 * Response for `analyze_video` — full commercial intelligence.
 */
export interface AnalyzeVideoResponse {
  video_id: string;
  title: string;
  channel: string;
  duration_seconds: number;
  language: string;
  analysis_timestamp: string;
  analysis_depth: "standard" | "deep";
  commercial_intent_score: number;
  entities?: ResponseEntity[];
  audience_intent?: {
    dominant_intent: string | null;
    intents: Array<{
      type: string;
      score: number;
      emotion: string;
      commercial_value: number;
      recommended_cta: string;
    }>;
  };
  quality?: {
    editorial_tier: string;
    teaching_score: number;
    visual_quality: number;
    botanical_literacy: number;
    standfirst?: string;
  };
  skills?: {
    primary: {
      name: string;
      level: string;
      teaching_quality: number;
    } | null;
    prerequisites: string[];
    next_skills: string[];
  };
  market_position?: {
    trend_direction: string | null;
    competition_level: number;
    content_gaps_nearby: string[];
    estimated_monthly_search_volume?: number;
  };
}

/**
 * Response for `get_commercial_entities` — entities only, lightweight.
 */
export interface CommercialEntitiesResponse {
  video_id: string;
  entities: Array<{
    name: string;
    category: string;
    confidence: number;
    is_shoppable: boolean;
    mentions: Array<{
      timestamp_seconds: number;
      context: string;
    }>;
  }>;
  total_count: number;
  categories_found: string[];
}

/**
 * Response for `get_monetization_opportunities` — scored strategies.
 */
export interface MonetizationResponse {
  video_id: string;
  opportunities: Array<{
    strategy: string;
    score: number;
    entities_applicable?: number;
    estimated_revenue_per_1k_views?: number;
    recommended_products?: string[];
    skill_foundation?: string;
    prerequisite_coverage?: number;
    brand_fit_categories?: string[];
    reasoning: string;
  }>;
}

/**
 * Response for `get_audience_insights` — intent archetypes.
 */
export interface AudienceInsightsResponse {
  video_id: string;
  dominant_intent: string | null;
  intents: Array<{
    type: string;
    score: number;
    emotion: string;
    commercial_value: number;
    recommended_cta: string;
  }>;
}

/**
 * Response for `discover_content_gaps` — market analysis.
 */
export interface ContentGapsResponse {
  gaps: Array<{
    topic: string;
    demand_score: number;
    competition: number;
    opportunity_score: number;
    estimated_monthly_searches?: number;
    trend: string;
    recommendation: string;
    monetization_angles?: string[];
  }>;
  emerging_topics: string[];
  declining_topics: string[];
}

/**
 * Response for `batch_analyze` — multi-video with comparison.
 */
export interface BatchAnalyzeResponse {
  analyses: AnalyzeVideoResponse[];
  total: number;
  comparison?: {
    shared_entities: Array<{
      name: string;
      category: string;
      video_count: number;
    }>;
    complementary_topics: string[];
    combined_audience_map: Record<string, number>;
  };
}

// ============================================================================
// FORMATTER: analyze_video
// ============================================================================

/**
 * Calculate a commercial intent score (0-100) from the analysis result.
 *
 * The score combines:
 * - Entity shoppability density (40%)
 * - Audience commercial value (30%)
 * - Content quality / editorial tier (20%)
 * - Seasonal relevance bonus (10%)
 */
function calculateCommercialIntentScore(result: AnalysisResult): number {
  let score = 0;

  // Entity shoppability density (0-40 points)
  if (result.entities && result.entities.length > 0) {
    const shoppableCount = result.entities.filter((e) => e.isShoppable).length;
    const shoppableRatio = shoppableCount / result.entities.length;
    const entityDensity = Math.min(result.entities.length / 20, 1); // 20+ entities = max
    score += (shoppableRatio * 0.6 + entityDensity * 0.4) * 40;
  }

  // Audience commercial value (0-30 points)
  if (result.audienceIntent) {
    const avgCommercialValue = result.audienceIntent.summary.avgCommercialValue;
    score += Math.min(avgCommercialValue, 1) * 30;
  }

  // Content quality / editorial tier (0-20 points)
  if (result.quality) {
    const tierScores: Record<string, number> = {
      FEATURED: 20,
      SUPPORTING: 12,
      ARCHIVE: 5,
    };
    score += tierScores[result.quality.editorialTier] ?? 10;
  }

  // Seasonal relevance bonus (0-10 points)
  if (result.seasonalContext) {
    if (result.seasonalContext.timing.isSeasonSpecific) {
      score += 7; // Season-specific content has higher commercial urgency
    } else if (result.seasonalContext.timing.isYearRound) {
      score += 4; // Evergreen content has consistent but lower urgency
    }
    if (result.seasonalContext.confidence > 0.7) {
      score += 3;
    }
  }

  return Math.round(Math.min(score, 100));
}

/**
 * Deduplicate intents by type, keeping the highest-scoring instance of each.
 */
function deduplicateIntents(
  detections: IntentDetectionResult[],
): IntentDetectionResult[] {
  const best = new Map<string, IntentDetectionResult>();
  for (const d of detections) {
    const existing = best.get(d.intent);
    if (!existing || d.commercialValue > existing.commercialValue) {
      best.set(d.intent, d);
    }
  }
  return Array.from(best.values()).sort(
    (a, b) => b.commercialValue - a.commercialValue,
  );
}

/**
 * Convert an AnalysisEntity to a ResponseEntity for the MCP output.
 */
function formatEntity(e: AnalysisEntity): ResponseEntity {
  const entity: ResponseEntity = {
    name: e.name,
    category: e.category.toLowerCase(),
    confidence: roundTo(e.confidence, 2),
    is_shoppable: e.isShoppable,
    mentions: e.mentions.map((m) => ({
      timestamp_seconds: m.timestampSeconds,
      context: m.context.length > 150 ? m.context.slice(0, 150) + '…' : m.context,
    })),
  };

  if (e.scientificName) {
    entity.scientific_name = e.scientificName;
  }

  if (e.monetizationPotential) {
    entity.monetization_potential = {
      affiliate_score: roundTo(e.monetizationPotential.affiliateScore, 2),
    };
    if (e.monetizationPotential.courseRelevance !== undefined) {
      entity.monetization_potential.course_relevance = roundTo(
        e.monetizationPotential.courseRelevance,
        2,
      );
    }
    if (e.monetizationPotential.contentGap !== undefined) {
      entity.monetization_potential.content_gap = roundTo(
        e.monetizationPotential.contentGap,
        2,
      );
    }
    if (e.monetizationPotential.reviewOpportunity !== undefined) {
      entity.monetization_potential.review_opportunity = roundTo(
        e.monetizationPotential.reviewOpportunity,
        2,
      );
    }
    if (e.monetizationPotential.comparisonContent !== undefined) {
      entity.monetization_potential.comparison_content = roundTo(
        e.monetizationPotential.comparisonContent,
        2,
      );
    }
  }

  return entity;
}

/**
 * Format a full analysis result into the `analyze_video` MCP response.
 *
 * Includes all six intelligence dimensions if available.
 * Handles missing/partial data by omitting those sections.
 */
export function formatAnalyzeVideoResponse(
  result: AnalysisResult,
): AnalyzeVideoResponse {
  const response: AnalyzeVideoResponse = {
    video_id: result.videoId,
    title: result.title,
    channel: result.channel,
    duration_seconds: result.durationSeconds,
    language: result.language,
    analysis_timestamp: result.analysisTimestamp,
    analysis_depth: result.analysisDepth,
    commercial_intent_score: calculateCommercialIntentScore(result),
  };

  // Entities dimension
  if (result.entities) {
    response.entities = result.entities.map(formatEntity);
  }

  // Audience intent dimension
  if (result.audienceIntent) {
    const topIntents = deduplicateIntents(result.audienceIntent.detections);
    response.audience_intent = {
      dominant_intent: result.audienceIntent.summary.topIntent || null,
      intents: topIntents.map((d) => ({
        type: d.intent,
        score: roundTo(d.score, 2),
        emotion: d.dominantEmotion ?? "neutral",
        commercial_value: roundTo(d.commercialValue, 2),
        recommended_cta: d.recommendedCTA ?? "",
      })),
    };
  }

  // Quality dimension
  if (result.quality) {
    response.quality = {
      editorial_tier: result.quality.editorialTier,
      teaching_score: Math.round(result.quality.contentDepth),
      visual_quality: Math.round(result.quality.visualQuality),
      botanical_literacy: Math.round(result.quality.botanicalLiteracy),
    };
    if (result.quality.standfirst) {
      response.quality.standfirst = result.quality.standfirst;
    }
  }

  // Skills dimension
  if (result.skills) {
    response.skills = {
      primary: result.skills.primarySkill
        ? {
            name: result.skills.primarySkill.name,
            level: result.skills.primarySkill.skillLevel,
            teaching_quality: result.skills.quality.overallScore,
          }
        : null,
      prerequisites: result.skills.sequencing.prerequisiteSkills,
      next_skills: result.skills.sequencing.nextSkillSuggestions,
    };
  }

  // Market position dimension
  if (result.categoryPotential || result.seasonalContext) {
    const contentGapsNearby: string[] = [];

    // Derive trend direction from category potential
    let trendDirection: string | null = null;
    let competitionLevel = 0;

    if (result.categoryPotential) {
      const actionToTrend: Record<string, string> = {
        priority: "rising",
        promote: "rising",
        monitor: "stable",
        reject: "declining",
      };
      trendDirection =
        actionToTrend[result.categoryPotential.recommendedAction] ?? "stable";
      // Competition level normalized to 0-1
      competitionLevel = roundTo(
        (100 - result.categoryPotential.overallPotential) / 100,
        2,
      );
    }

    response.market_position = {
      trend_direction: trendDirection,
      competition_level: competitionLevel,
      content_gaps_nearby: contentGapsNearby,
    };
  }

  return response;
}

// ============================================================================
// FORMATTER: get_commercial_entities
// ============================================================================

/**
 * Format an analysis result into the `get_commercial_entities` MCP response.
 *
 * Returns entities only (no monetization scoring, no audience intent, no market position).
 * Optionally filters to specific commerce categories.
 */
export function formatCommercialEntitiesResponse(
  result: AnalysisResult,
  categories?: string[],
): CommercialEntitiesResponse {
  let entities = result.entities ?? [];

  // Filter by category if specified
  if (categories && categories.length > 0) {
    const categorySet = new Set(categories.map((c) => c.toUpperCase()));
    entities = entities.filter((e) => categorySet.has(e.category));
  }

  const categoriesFound = [
    ...new Set(entities.map((e) => e.category.toLowerCase())),
  ];

  return {
    video_id: result.videoId,
    entities: entities.map((e) => ({
      name: e.name,
      category: e.category.toLowerCase(),
      confidence: roundTo(e.confidence, 2),
      is_shoppable: e.isShoppable,
      mentions: e.mentions.map((m) => ({
        timestamp_seconds: m.timestampSeconds,
        context: m.context,
      })),
    })),
    total_count: entities.length,
    categories_found: categoriesFound,
  };
}

// ============================================================================
// FORMATTER: get_monetization_opportunities
// ============================================================================

/**
 * Derive monetization opportunities from the analysis result.
 *
 * Generates up to 3 strategies:
 * 1. Affiliate Commerce — if shoppable entities exist
 * 2. Course Creation — if skill extraction shows teaching quality
 * 3. Sponsored Content — if quality and authority are high
 */
export function formatMonetizationResponse(
  result: AnalysisResult,
): MonetizationResponse {
  const opportunities: MonetizationResponse["opportunities"] = [];
  const entities = result.entities ?? [];
  const shoppableEntities = entities.filter((e) => e.isShoppable);

  // Strategy 1: Affiliate Commerce
  if (shoppableEntities.length > 0) {
    const avgAffiliateScore =
      shoppableEntities.reduce(
        (sum, e) => sum + (e.monetizationPotential?.affiliateScore ?? 0.5),
        0,
      ) / shoppableEntities.length;

    // Estimate revenue per 1K views based on entity count and commercial value
    const commercialValue =
      result.audienceIntent?.summary.avgCommercialValue ?? 0.3;
    const estimatedRev = roundTo(
      shoppableEntities.length * avgAffiliateScore * commercialValue * 10,
      2,
    );

    const topProducts = shoppableEntities
      .sort(
        (a, b) =>
          (b.monetizationPotential?.affiliateScore ?? 0) -
          (a.monetizationPotential?.affiliateScore ?? 0),
      )
      .slice(0, 5)
      .map((e) => e.name);

    // Build reasoning
    const intentPart = result.audienceIntent
      ? `, ${result.audienceIntent.summary.topIntent} intent detected`
      : "";
    const seasonPart =
      result.seasonalContext?.timing.isSeasonSpecific
        ? ", seasonal buying window"
        : "";

    const affiliateReasoning = `${shoppableEntities.length} shoppable entities${intentPart}${seasonPart}`;
    opportunities.push({
      strategy: "affiliate_commerce",
      score: roundTo(avgAffiliateScore, 2),
      entities_applicable: shoppableEntities.length,
      estimated_revenue_per_1k_views: estimatedRev,
      recommended_products: topProducts,
      reasoning: affiliateReasoning.length > 100 ? affiliateReasoning.slice(0, 100) + '…' : affiliateReasoning,
    });
  }

  // Strategy 2: Course Creation
  if (result.skills && result.skills.quality.overallScore >= 50) {
    const teachingScore = result.skills.quality.overallScore / 100;
    const hasProgression =
      result.skills.sequencing.prerequisiteSkills.length > 0 ||
      result.skills.sequencing.nextSkillSuggestions.length > 0;
    const progressionBonus = hasProgression ? 0.15 : 0;
    const courseScore = roundTo(
      Math.min(teachingScore + progressionBonus, 1),
      2,
    );

    const prerequisiteCoverage = roundTo(
      result.skills.sequencing.prerequisiteSkills.length > 0
        ? Math.min(result.skills.sequencing.prerequisiteSkills.length / 3, 1)
        : 0,
      2,
    );

    const courseReasoning = `Teaching quality ${result.skills.quality.overallScore}/100, ${result.skills.primarySkill.skillLevel} level${hasProgression ? ", clear skill progression" : ""}`;
    opportunities.push({
      strategy: "course_creation",
      score: courseScore,
      skill_foundation: result.skills.primarySkill.name,
      prerequisite_coverage: prerequisiteCoverage,
      reasoning: courseReasoning.length > 100 ? courseReasoning.slice(0, 100) + '…' : courseReasoning,
    });
  }

  // Strategy 3: Sponsored Content
  if (result.quality && result.quality.overallScore >= 55) {
    const qualityNorm = result.quality.overallScore / 100;
    const botanicalTrust = result.quality.botanicalLiteracy / 100;
    const sponsoredScore = roundTo((qualityNorm + botanicalTrust) / 2, 2);

    // Derive brand fit categories from entity categories
    const categorySet = new Set(entities.map((e) => e.category.toLowerCase()));
    const brandFitCategories = Array.from(categorySet).slice(0, 5);

    const sponsoredReasoning = `Editorial quality ${result.quality.overallScore}/100, botanical literacy ${result.quality.botanicalLiteracy}/100, trusted editorial voice`;
    opportunities.push({
      strategy: "sponsored_content",
      score: sponsoredScore,
      brand_fit_categories:
        brandFitCategories.length > 0 ? brandFitCategories : undefined,
      reasoning: sponsoredReasoning.length > 100 ? sponsoredReasoning.slice(0, 100) + '…' : sponsoredReasoning,
    });
  }

  // Sort by score descending
  opportunities.sort((a, b) => b.score - a.score);

  return {
    video_id: result.videoId,
    opportunities,
  };
}

// ============================================================================
// FORMATTER: get_audience_insights
// ============================================================================

/**
 * Format an analysis result into the `get_audience_insights` MCP response.
 *
 * Returns the 7-archetype intent map with emotions, commercial values,
 * and recommended CTAs. Deduplicates by intent type.
 */
export function formatAudienceInsightsResponse(
  result: AnalysisResult,
): AudienceInsightsResponse {
  if (!result.audienceIntent) {
    return {
      video_id: result.videoId,
      dominant_intent: null,
      intents: [],
    };
  }

  const topIntents = deduplicateIntents(result.audienceIntent.detections);

  return {
    video_id: result.videoId,
    dominant_intent: result.audienceIntent.summary.topIntent || null,
    intents: topIntents.map((d) => ({
      type: d.intent,
      score: roundTo(d.score, 2),
      emotion: d.dominantEmotion ?? "neutral",
      commercial_value: roundTo(d.commercialValue, 2),
      recommended_cta: d.recommendedCTA ?? "",
    })),
  };
}

// ============================================================================
// FORMATTER: discover_content_gaps
// ============================================================================

/**
 * Format content gaps into the `discover_content_gaps` MCP response.
 *
 * The gaps are produced by market intelligence (not per-video analysis),
 * so this formatter takes a separate ContentGap array rather than an
 * AnalysisResult.
 */
export function formatContentGapsResponse(
  gaps: ContentGap[],
): ContentGapsResponse {
  const emerging = gaps
    .filter((g) => g.trend === "rising" || g.trend === "emerging")
    .map((g) => g.topic);

  const declining = gaps
    .filter((g) => g.trend === "declining")
    .map((g) => g.topic);

  return {
    gaps: gaps.map((g) => ({
      topic: g.topic,
      demand_score: roundTo(g.demandScore, 2),
      competition: roundTo(g.competition, 2),
      opportunity_score: roundTo(g.opportunityScore, 2),
      estimated_monthly_searches: g.estimatedMonthlySearches,
      trend: g.trend,
      recommendation: g.recommendation,
      monetization_angles: g.monetizationAngles,
    })),
    emerging_topics: emerging,
    declining_topics: declining,
  };
}

// ============================================================================
// FORMATTER: batch_analyze
// ============================================================================

/**
 * Format multiple analysis results into the `batch_analyze` MCP response.
 *
 * When `compare` is true, generates cross-video comparison including:
 * - Shared entities (entities appearing in multiple videos)
 * - Complementary topics (unique primary skills/topics per video)
 * - Combined audience map (aggregated intent distribution)
 */
export function formatBatchAnalyzeResponse(
  results: AnalysisResult[],
  compare: boolean,
): BatchAnalyzeResponse {
  const analyses = results.map((r) => formatAnalyzeVideoResponse(r));

  const response: BatchAnalyzeResponse = {
    analyses,
    total: analyses.length,
  };

  if (compare && results.length > 1) {
    response.comparison = buildCrossVideoComparison(results);
  }

  return response;
}

/**
 * Build cross-video comparison from multiple analysis results.
 */
function buildCrossVideoComparison(
  results: AnalysisResult[],
): BatchAnalyzeResponse["comparison"] {
  // Shared entities: entities that appear in 2+ videos
  const entityOccurrences = new Map<
    string,
    { name: string; category: string; videoCount: number }
  >();

  for (const result of results) {
    // Track unique entities per video to avoid double-counting
    const seenInVideo = new Set<string>();
    for (const entity of result.entities ?? []) {
      const key = entity.name.toLowerCase();
      if (seenInVideo.has(key)) continue;
      seenInVideo.add(key);

      const existing = entityOccurrences.get(key);
      if (existing) {
        existing.videoCount++;
      } else {
        entityOccurrences.set(key, {
          name: entity.name,
          category: entity.category.toLowerCase(),
          videoCount: 1,
        });
      }
    }
  }

  const sharedEntities = Array.from(entityOccurrences.values())
    .filter((e) => e.videoCount >= 2)
    .sort((a, b) => b.videoCount - a.videoCount)
    .map((e) => ({
      name: e.name,
      category: e.category,
      video_count: e.videoCount,
    }));

  // Complementary topics: unique primary skills/topics per video
  const allTopics = new Set<string>();
  const topicCounts = new Map<string, number>();

  for (const result of results) {
    if (result.skills?.primarySkill?.displayName) {
      const topic = result.skills.primarySkill.displayName;
      allTopics.add(topic);
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }

  // Complementary = topics that appear in only one video
  const complementaryTopics = Array.from(allTopics).filter(
    (t) => (topicCounts.get(t) ?? 0) === 1,
  );

  // Combined audience map: aggregated intent distribution across all videos
  const combinedAudienceMap: Record<string, number> = {};

  for (const result of results) {
    if (result.audienceIntent?.summary.intentDistribution) {
      for (const [intent, data] of Object.entries(
        result.audienceIntent.summary.intentDistribution,
      )) {
        combinedAudienceMap[intent] =
          (combinedAudienceMap[intent] ?? 0) + data.avgScore;
      }
    }
  }

  // Normalize combined audience map to 0-1
  const mapValues = Object.values(combinedAudienceMap);
  const maxValue = mapValues.length > 0 ? Math.max(...mapValues) : 1;
  if (maxValue > 0) {
    for (const key of Object.keys(combinedAudienceMap)) {
      combinedAudienceMap[key] = roundTo(
        combinedAudienceMap[key]! / maxValue,
        2,
      );
    }
  }

  return {
    shared_entities: sharedEntities,
    complementary_topics: complementaryTopics,
    combined_audience_map: combinedAudienceMap,
  };
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
