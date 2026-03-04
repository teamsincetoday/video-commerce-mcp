/**
 * Market Intelligence Orchestrator
 *
 * Central coordinator for Layer 2 market intelligence tools.
 * Similar to PipelineOrchestrator (Layer 1), this class coordinates
 * the six market intelligence tools:
 *
 * 1. discover_opportunities   -- convergence scoring with recommendations
 * 2. scan_affiliate_programs  -- affiliate network search
 * 3. assess_channel_authority -- 5-dimension channel scoring
 * 4. map_category_affinity   -- cross-category relationships
 * 5. track_category_lifecycle -- lifecycle state machine
 * 6. get_seasonal_calendar   -- region-specific commerce events
 *
 * Each tool wraps the extracted market-intelligence modules and provides
 * sensible defaults/seed data when no database is available.
 */

import type { AIClient, Logger } from "./types.js";
import { defaultLogger } from "./types.js";

// Market intelligence modules
import {
  detectConvergence,
  generateReasoning,
  type ConvergenceInput,
  type ConvergenceSignals,
} from "./market-intelligence/convergence-detector.js";

import {
  AwinProgramScanner,
} from "./market-intelligence/awin-scanner.js";

import {
  createHybridFilter,
} from "./market-intelligence/hybrid-filter.js";

import {
  evaluateChannel,
  CRITERIA_METADATA,
  type ChannelForVetting,
  type CriterionResult,
  type CriterionEvaluator,
  type VettingResult,
} from "./market-intelligence/channel-vetting.js";

import {
  createAIEvaluator,
} from "./market-intelligence/ai-composite-evaluator.js";

import {
  calculateAllAffinities,
  type CategoryAffinityInput,
  type AffinityResult,
  type OverlapData,
} from "./market-intelligence/affinity-calculator.js";

import {
  CategoryLifecycleManager,
  type LifecycleStage,
  type CandidateForPromotion,
} from "./market-intelligence/category-lifecycle.js";

import {
  getCurrentSeason,
  getDefaultGardeningPromotions,
  buildPromotionFromTemplate,
  type DefaultPromotionTemplate,
  type EthnobotanicalEvent,
} from "./market-intelligence/commerce-calendar.js";

// ============================================================================
// TYPES -- Tool Result Shapes
// ============================================================================

export interface OpportunityResult {
  categoryId: string;
  categoryName: string;
  convergenceScore: number;
  demandScore: number;
  commissionScore: number;
  authorityScore: number;
  competitionScore: number;
  trendDirection: string;
  velocityScore: number;
  opportunityScore: number;
  priority: string;
  recommendation: string;
  reasoning: string;
  estimatedRevenue: number;
  estimatedCost: number;
  roiEstimate: number;
  timeToRevenue: number;
  confidence: number;
}

export interface AffiliateProgramResult {
  advertiserId: number;
  advertiserName: string;
  relevanceScore: number;
  relevanceReason: string;
  commission: { min: number; max: number };
  cookieDuration: number;
  avgOrderValue?: number;
  supplierCountry?: string;
  supplierRegion?: string;
  verticals: Record<string, boolean>;
}

export interface ChannelAuthorityResult {
  channelId: string;
  channelName: string;
  scores: {
    reach: number;
    engagement: number;
    quality: number;
    trust: number;
    commercial: number;
  };
  compositeScore: number;
  confidence: number;
  decision: string;
  requiresHumanReview: boolean;
  humanReviewReasons: string[];
  criteriaDetails: Array<{
    criterionId: string;
    score: number;
    confidence: number;
    evidence: string[];
  }>;
  evaluatedAt: string;
}

export interface CategoryAffinityResult {
  sourceCategory: string;
  depth: number;
  relationships: Array<{
    targetCategory: string;
    affinityScore: number;
    relationshipType: string;
    videoOverlap: number;
    keywordOverlap: number;
    commerceOverlap: number;
    creatorOverlap: number;
    confidence: number;
  }>;
  expansionPaths: Array<{
    path: string[];
    totalAffinity: number;
    recommendation: string;
  }>;
}

export interface CategoryLifecycleResult {
  category: string;
  stage: LifecycleStage;
  signals: Array<{
    signal: string;
    value: number | string;
    direction: "positive" | "negative" | "neutral";
  }>;
  transitionProbability: Record<string, number>;
  recommendedActions: string[];
  nextStage: LifecycleStage | null;
  convergenceScore: number;
  weeksInCurrentStage: number;
}

export interface SeasonalCalendarResult {
  region: string;
  hemisphere: "northern" | "southern";
  currentSeason: string;
  monthsAhead: number;
  events: Array<{
    title: string;
    description: string;
    type: string;
    startDate: string;
    endDate: string;
    isLive: boolean;
    daysRemaining: number;
    demandMultiplier: number;
    categories: string[];
    keywords: string[];
    badgeText?: string;
    badgeColor?: string;
    featured: boolean;
    region?: string;
  }>;
  ethnobotanicalEvents: Array<{
    event: string;
    month: number;
    plants: string[];
    priority: string;
  }>;
}

// ============================================================================
// ORCHESTRATOR OPTIONS
// ============================================================================

export interface MarketIntelOptions {
  /** Optional AI client for AI-powered evaluations. */
  aiClient?: AIClient;
  /** Awin API key for affiliate scanning. */
  awinApiKey?: string;
  /** Logger instance. */
  logger?: Logger;
  /** Seed data for categories (used when no database is available). */
  seedCategories?: SeedCategory[];
}

export interface SeedCategory {
  id: string;
  name: string;
  key: string;
  parentId: string | null;
  primaryKeywords: string[];
  secondaryKeywords: string[];
  demandScore: number;
  commissionScore: number;
  authorityScore: number;
  competitorCount: number;
  contentVolume: number;
  avgContentQuality: number;
  recentConvergenceScores: number[];
  stage: LifecycleStage;
  productMentionCount: number;
  videoMentionCount: number;
  keywordConfidence: number;
}

// ============================================================================
// DEFAULT SEED DATA
// ============================================================================

/**
 * Default gardening seed categories for when no database is available.
 * These provide realistic demo data for the market intelligence tools.
 */
const DEFAULT_SEED_CATEGORIES: SeedCategory[] = [
  {
    id: "perennials",
    name: "Perennials",
    key: "perennials",
    parentId: null,
    primaryKeywords: ["perennial", "herbaceous", "border plant", "hardy perennial", "cottage garden"],
    secondaryKeywords: ["echinacea", "helenium", "salvia", "geranium", "aster", "rudbeckia"],
    demandScore: 78,
    commissionScore: 65,
    authorityScore: 72,
    competitorCount: 25,
    contentVolume: 180,
    avgContentQuality: 68,
    recentConvergenceScores: [35, 36, 38, 37, 39, 40, 42, 41, 43, 44, 45, 46, 47, 48],
    stage: "promoted",
    productMentionCount: 450,
    videoMentionCount: 85,
    keywordConfidence: 0.85,
  },
  {
    id: "raised-beds",
    name: "Raised Bed Gardening",
    key: "raised-beds",
    parentId: null,
    primaryKeywords: ["raised bed", "raised garden bed", "no dig", "square foot", "container garden"],
    secondaryKeywords: ["timber", "sleepers", "soil mix", "weed membrane", "edging"],
    demandScore: 85,
    commissionScore: 72,
    authorityScore: 55,
    competitorCount: 15,
    contentVolume: 95,
    avgContentQuality: 62,
    recentConvergenceScores: [28, 30, 32, 35, 37, 40, 42, 45, 47, 50, 52, 54, 55, 57],
    stage: "promoted",
    productMentionCount: 320,
    videoMentionCount: 65,
    keywordConfidence: 0.82,
  },
  {
    id: "no-dig",
    name: "No-Dig Gardening",
    key: "no-dig",
    parentId: "raised-beds",
    primaryKeywords: ["no dig", "no-dig", "charles dowding", "lasagna gardening", "no till"],
    secondaryKeywords: ["cardboard mulch", "compost layer", "weed suppression", "soil biology"],
    demandScore: 92,
    commissionScore: 58,
    authorityScore: 80,
    competitorCount: 8,
    contentVolume: 60,
    avgContentQuality: 75,
    recentConvergenceScores: [40, 42, 45, 48, 50, 53, 55, 58, 60, 62, 63, 65, 66, 68],
    stage: "promoted",
    productMentionCount: 200,
    videoMentionCount: 45,
    keywordConfidence: 0.9,
  },
  {
    id: "native-plants",
    name: "Native Plants & Wildlife Gardening",
    key: "native-plants",
    parentId: null,
    primaryKeywords: ["native plants", "wildlife garden", "pollinator", "wildflower", "biodiversity"],
    secondaryKeywords: ["meadow", "bee friendly", "butterfly garden", "bird habitat", "hedge"],
    demandScore: 88,
    commissionScore: 45,
    authorityScore: 60,
    competitorCount: 12,
    contentVolume: 75,
    avgContentQuality: 70,
    recentConvergenceScores: [20, 22, 25, 28, 30, 33, 35, 38, 40, 42, 44, 46, 48, 50],
    stage: "trend_validated",
    productMentionCount: 150,
    videoMentionCount: 40,
    keywordConfidence: 0.75,
  },
  {
    id: "houseplants",
    name: "Houseplants & Indoor Growing",
    key: "houseplants",
    parentId: null,
    primaryKeywords: ["houseplant", "indoor plant", "pothos", "monstera", "fiddle leaf"],
    secondaryKeywords: ["propagation", "repotting", "grow light", "humidity", "aroid"],
    demandScore: 82,
    commissionScore: 70,
    authorityScore: 48,
    competitorCount: 35,
    contentVolume: 220,
    avgContentQuality: 55,
    recentConvergenceScores: [45, 44, 43, 42, 41, 40, 39, 38, 37, 37, 36, 36, 35, 35],
    stage: "promoted",
    productMentionCount: 580,
    videoMentionCount: 110,
    keywordConfidence: 0.88,
  },
  {
    id: "grow-your-own",
    name: "Grow Your Own Food",
    key: "grow-your-own",
    parentId: null,
    primaryKeywords: ["grow your own", "vegetable garden", "allotment", "kitchen garden", "edible garden"],
    secondaryKeywords: ["tomato", "courgette", "bean", "lettuce", "potato", "onion"],
    demandScore: 90,
    commissionScore: 68,
    authorityScore: 70,
    competitorCount: 30,
    contentVolume: 250,
    avgContentQuality: 65,
    recentConvergenceScores: [42, 43, 44, 44, 45, 46, 46, 47, 47, 48, 48, 49, 49, 50],
    stage: "promoted",
    productMentionCount: 650,
    videoMentionCount: 120,
    keywordConfidence: 0.92,
  },
  {
    id: "garden-design",
    name: "Garden Design",
    key: "garden-design",
    parentId: null,
    primaryKeywords: ["garden design", "landscape design", "planting plan", "color scheme", "garden layout"],
    secondaryKeywords: ["focal point", "path", "patio", "water feature", "lighting"],
    demandScore: 70,
    commissionScore: 55,
    authorityScore: 65,
    competitorCount: 18,
    contentVolume: 110,
    avgContentQuality: 72,
    recentConvergenceScores: [25, 25, 26, 26, 27, 27, 28, 28, 29, 29, 30, 30, 31, 31],
    stage: "promoted",
    productMentionCount: 280,
    videoMentionCount: 55,
    keywordConfidence: 0.78,
  },
  {
    id: "succulent-terrariums",
    name: "Succulents & Terrariums",
    key: "succulent-terrariums",
    parentId: "houseplants",
    primaryKeywords: ["succulent", "terrarium", "cactus", "echeveria", "sedum"],
    secondaryKeywords: ["drainage", "grit", "glass container", "moss", "pebbles"],
    demandScore: 55,
    commissionScore: 50,
    authorityScore: 35,
    competitorCount: 20,
    contentVolume: 85,
    avgContentQuality: 50,
    recentConvergenceScores: [15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 10, 9, 9],
    stage: "keywords_learned",
    productMentionCount: 95,
    videoMentionCount: 25,
    keywordConfidence: 0.65,
  },
];

/**
 * Default ethnobotanical events for seasonal calendar.
 */
const DEFAULT_ETHNOBOTANICAL_EVENTS: EthnobotanicalEvent[] = [
  { event: "Spring Equinox Sowing", month: 3, region: "GLOBAL", plantsInvolved: ["Tomato", "Basil", "Sweet Pea", "Cosmos"], priority: "high" },
  { event: "Chelsea Flower Show", month: 5, region: "UK", plantsInvolved: ["Rose", "Peony", "Delphinium", "Lupin"], priority: "high" },
  { event: "Eisheiligen (Ice Saints)", month: 5, region: "EU", plantsInvolved: ["Dahlia", "Runner Bean", "Courgette"], priority: "medium" },
  { event: "Summer Solstice Harvest", month: 6, region: "GLOBAL", plantsInvolved: ["Strawberry", "Raspberry", "Cherry", "Lavender"], priority: "medium" },
  { event: "Garlic Planting Window", month: 10, region: "UK", plantsInvolved: ["Garlic", "Broad Bean", "Onion Set"], priority: "medium" },
  { event: "Tulip Planting Season", month: 11, region: "GLOBAL", plantsInvolved: ["Tulip", "Narcissus", "Crocus", "Hyacinth"], priority: "high" },
  { event: "Apple Day", month: 10, region: "UK", plantsInvolved: ["Apple", "Pear", "Quince", "Medlar"], priority: "low" },
  { event: "National Gardening Week", month: 4, region: "UK", plantsInvolved: ["Various"], priority: "high" },
  { event: "Advent Wreath Making", month: 12, region: "EU", plantsInvolved: ["Holly", "Ivy", "Mistletoe", "Pine"], priority: "low" },
  { event: "Bare Root Season Opens", month: 11, region: "UK", plantsInvolved: ["Rose", "Apple", "Hedge plants", "Fruit trees"], priority: "high" },
  { event: "Seed Swap Season", month: 2, region: "GLOBAL", plantsInvolved: ["Heritage Tomato", "Bean", "Squash", "Pepper"], priority: "medium" },
  { event: "RHS Hampton Court Palace Garden Festival", month: 7, region: "UK", plantsInvolved: ["Hydrangea", "Agapanthus", "Crocosmia"], priority: "medium" },
];

// ============================================================================
// MARKET INTELLIGENCE ORCHESTRATOR
// ============================================================================

export class MarketIntelligenceOrchestrator {
  private readonly aiClient?: AIClient;
  private readonly awinApiKey?: string;
  private readonly logger: Logger;
  private readonly categories: SeedCategory[];
  private readonly lifecycleManager: CategoryLifecycleManager;

  constructor(options: MarketIntelOptions = {}) {
    this.aiClient = options.aiClient;
    this.awinApiKey = options.awinApiKey;
    this.logger = options.logger ?? defaultLogger;
    this.categories =
      options.seedCategories && options.seedCategories.length > 0
        ? options.seedCategories
        : DEFAULT_SEED_CATEGORIES;
    this.lifecycleManager = new CategoryLifecycleManager({}, this.logger);
  }

  // ==========================================================================
  // Tool 7: discover_opportunities
  // ==========================================================================

  /**
   * Three-forces convergence scoring: where demand, commission, and authority
   * align. Returns ranked opportunities with recommendations.
   */
  discoverOpportunities(
    vertical: string,
    minScore?: number,
  ): OpportunityResult[] {
    this.logger.info("Discovering opportunities", { vertical, minScore });

    const threshold = minScore ?? 0;
    const results: OpportunityResult[] = [];

    for (const category of this.categories) {
      // Build convergence input from seed data
      const input: ConvergenceInput = {
        categoryId: category.id,
        categoryName: category.name,
        demandScore: category.demandScore,
        commissionScore: category.commissionScore,
        authorityScore: category.authorityScore,
        trendDataQuality: category.keywordConfidence,
        competitorCount: category.competitorCount,
        contentVolume: category.contentVolume,
        averageContentQuality: category.avgContentQuality,
        recentConvergenceScores: category.recentConvergenceScores,
        sampleSize: category.recentConvergenceScores.length,
      };

      const signals: ConvergenceSignals = detectConvergence(
        input,
        this.logger,
      );

      // Apply minimum score filter
      if (signals.convergenceScore < threshold * 100) {
        continue;
      }

      const reasoning = generateReasoning(signals);

      results.push({
        categoryId: signals.categoryId,
        categoryName: signals.categoryName,
        convergenceScore: signals.convergenceScore,
        demandScore: signals.demandScore,
        commissionScore: signals.commissionScore,
        authorityScore: signals.authorityScore,
        competitionScore: signals.competitionScore,
        trendDirection: signals.trendDirection,
        velocityScore: signals.velocityScore,
        opportunityScore: signals.opportunityScore,
        priority: signals.priority,
        recommendation: signals.recommendation,
        reasoning,
        estimatedRevenue: signals.estimatedRevenue,
        estimatedCost: signals.estimatedCost,
        roiEstimate: signals.roiEstimate,
        timeToRevenue: signals.timeToRevenue,
        confidence: signals.confidence,
      });
    }

    // Sort by opportunity score descending
    results.sort((a, b) => b.opportunityScore - a.opportunityScore);

    this.logger.info("Opportunity discovery complete", {
      vertical,
      totalScanned: this.categories.length,
      opportunitiesFound: results.length,
    });

    return results;
  }

  // ==========================================================================
  // Tool 8: scan_affiliate_programs
  // ==========================================================================

  /**
   * Search affiliate networks for programs matching a category/vertical.
   * Uses keyword-based filtering (free) with optional AI refinement.
   */
  async scanAffiliatePrograms(
    category: string,
    networks?: string[],
  ): Promise<{
    category: string;
    networksScanned: string[];
    programs: AffiliateProgramResult[];
    totalFound: number;
    filterStats: { keywordOnly: number; aiCalls: number; costSaved: string };
  }> {
    this.logger.info("Scanning affiliate programs", { category, networks });

    const requestedNetworks = networks ?? ["awin", "cj", "shareasale"];
    const programs: AffiliateProgramResult[] = [];

    // If Awin API key is available and awin is in the requested networks, scan live
    if (this.awinApiKey && requestedNetworks.includes("awin")) {
      try {
        const scanner = new AwinProgramScanner({
          awinApiKey: this.awinApiKey,
          aiClient: this.aiClient,
          logger: this.logger,
          minRelevanceScore: 40,
        });

        const discovered = await scanner.discoverPrograms(category);

        for (const program of discovered) {
          programs.push({
            advertiserId: program.advertiserId,
            advertiserName: program.advertiserName,
            relevanceScore: program.relevanceScore,
            relevanceReason: program.relevanceReason,
            commission: program.commission,
            cookieDuration: program.cookieDuration,
            avgOrderValue: program.avgOrderValue,
            supplierCountry: program.supplierCountry,
            supplierRegion: program.supplierRegion,
            verticals: {
              plants: program.verticals.supportsPlants,
              seeds: program.verticals.supportsSeeds,
              tools: program.verticals.supportsTools,
              materials: program.verticals.supportsMaterials,
              books: program.verticals.supportsBooks,
              courses: program.verticals.supportsCourses,
              events: program.verticals.supportsEvents,
            },
          });
        }
      } catch (error) {
        this.logger.error(
          "Awin scan failed",
          error instanceof Error ? error : undefined,
          { category },
        );
      }
    }

    // For networks without live API access, use keyword-based filtering
    // on a built-in set of known gardening programs
    const hybridFilter = createHybridFilter(this.aiClient, "balanced", this.logger);

    if (programs.length === 0) {
      // No live data -- use built-in gardening program knowledge
      const knownPrograms = this.getKnownPrograms(category);
      for (const known of knownPrograms) {
        const relevance = await hybridFilter.analyzeRelevance(
          known.name,
          known.description,
          known.terms,
        );

        if (relevance.isRelevant) {
          programs.push({
            advertiserId: known.id,
            advertiserName: known.name,
            relevanceScore: relevance.relevanceScore,
            relevanceReason: relevance.reason,
            commission: known.commission,
            cookieDuration: known.cookieDuration,
            avgOrderValue: known.avgOrderValue,
            supplierCountry: known.country,
            supplierRegion: known.region,
            verticals: {
              plants: relevance.verticals.supportsPlants,
              seeds: relevance.verticals.supportsSeeds,
              tools: relevance.verticals.supportsTools,
              materials: relevance.verticals.supportsMaterials,
              books: relevance.verticals.supportsBooks,
              courses: relevance.verticals.supportsCourses,
              events: relevance.verticals.supportsEvents,
            },
          });
        }
      }
    }

    const stats = hybridFilter.getStats();

    return {
      category,
      networksScanned: requestedNetworks,
      programs: programs.sort((a, b) => b.relevanceScore - a.relevanceScore),
      totalFound: programs.length,
      filterStats: {
        keywordOnly: stats.keywordOnly,
        aiCalls: stats.aiCalls,
        costSaved: stats.totalCostSaved,
      },
    };
  }

  // ==========================================================================
  // Tool 9: assess_channel_authority
  // ==========================================================================

  /**
   * 5-dimension channel authority scoring.
   * Uses heuristic evaluators with optional AI composite evaluation.
   */
  async assessChannelAuthority(
    channelId: string,
    channelUrl?: string,
  ): Promise<ChannelAuthorityResult> {
    this.logger.info("Assessing channel authority", { channelId, channelUrl });

    // Build channel object for vetting
    const channel: ChannelForVetting = {
      id: channelId,
      channelId,
      channelName: channelId, // Will be overridden by actual data if available
      channelUrl: channelUrl ?? `https://youtube.com/channel/${channelId}`,
      description: null,
      subscriberCount: null,
      videoCount: null,
      thumbnailUrl: null,
    };

    // Create heuristic evaluators for each criterion
    const evaluators: CriterionEvaluator[] = CRITERIA_METADATA.map(
      (meta) => this.createHeuristicEvaluator(meta.id, channel),
    );

    // Run evaluation with optional AI evaluator
    const result: VettingResult = await evaluateChannel(
      channel,
      evaluators,
      {
        aiEvaluator: this.aiClient
          ? createAIEvaluator(this.aiClient, [], this.logger)
          : undefined,
        logger: this.logger,
      },
    );

    // Map criteria results to the 5-dimension MCP output format
    // (reach, engagement, quality, trust, commercial)
    const scores = this.mapToFiveDimensions(result.criteriaResults);

    return {
      channelId: result.channelId,
      channelName: channel.channelName,
      scores,
      compositeScore: result.score,
      confidence: result.confidence,
      decision: result.decision,
      requiresHumanReview: result.requiresHumanReview,
      humanReviewReasons: result.humanReviewReasons,
      criteriaDetails: result.criteriaResults.map((cr) => ({
        criterionId: cr.criterionId,
        score: cr.score,
        confidence: cr.confidence,
        evidence: cr.evidence,
      })),
      evaluatedAt: result.evaluatedAt.toISOString(),
    };
  }

  // ==========================================================================
  // Tool 10: map_category_affinity
  // ==========================================================================

  /**
   * Cross-category relationship mapping with expansion paths.
   */
  mapCategoryAffinity(
    category: string,
    depth: number = 2,
  ): CategoryAffinityResult {
    this.logger.info("Mapping category affinity", { category, depth });

    // Find the source category
    const sourceCategory = this.categories.find(
      (c) =>
        c.key === category.toLowerCase().replace(/\s+/g, "-") ||
        c.name.toLowerCase() === category.toLowerCase() ||
        c.id === category,
    );

    if (!sourceCategory) {
      // Category not found in seed data -- return empty result with note
      return {
        sourceCategory: category,
        depth,
        relationships: [],
        expansionPaths: [],
      };
    }

    // Build affinity inputs for all categories
    const affinityInputs: CategoryAffinityInput[] = this.categories.map(
      (c) => ({
        categoryId: c.id,
        categoryKey: c.key,
        displayName: c.name,
        parentCategoryId: c.parentId,
        primaryKeywords: c.primaryKeywords,
        secondaryKeywords: c.secondaryKeywords,
      }),
    );

    // Provide overlap data using seed data heuristics
    const overlapProvider = (
      a: CategoryAffinityInput,
      b: CategoryAffinityInput,
    ): OverlapData => {
      return this.estimateOverlap(a, b);
    };

    // Calculate all pairwise affinities
    const allAffinities = calculateAllAffinities(
      affinityInputs,
      overlapProvider,
      this.logger,
    );

    // Filter to relationships involving the source category
    const sourceRelationships = allAffinities
      .filter(
        (pair) =>
          pair.categoryAId === sourceCategory.id ||
          pair.categoryBId === sourceCategory.id,
      )
      .map((pair) => {
        const targetId =
          pair.categoryAId === sourceCategory.id
            ? pair.categoryBId
            : pair.categoryAId;
        const targetCat = this.categories.find((c) => c.id === targetId);
        return {
          targetCategory: targetCat?.name ?? targetId,
          affinityScore: pair.result.affinityScore,
          relationshipType: pair.result.relationshipType,
          videoOverlap: pair.result.videoOverlap,
          keywordOverlap: pair.result.keywordOverlap,
          commerceOverlap: pair.result.commerceOverlap,
          creatorOverlap: pair.result.creatorOverlap,
          confidence: pair.result.confidenceScore,
        };
      })
      .sort((a, b) => b.affinityScore - a.affinityScore);

    // Build expansion paths (for depth > 1, traverse further)
    const expansionPaths = this.buildExpansionPaths(
      sourceCategory.id,
      allAffinities,
      depth,
    );

    return {
      sourceCategory: sourceCategory.name,
      depth,
      relationships: sourceRelationships,
      expansionPaths,
    };
  }

  // ==========================================================================
  // Tool 11: track_category_lifecycle
  // ==========================================================================

  /**
   * Track the lifecycle state of a category.
   */
  trackCategoryLifecycle(category: string): CategoryLifecycleResult {
    this.logger.info("Tracking category lifecycle", { category });

    // Find the category in seed data
    const cat = this.categories.find(
      (c) =>
        c.key === category.toLowerCase().replace(/\s+/g, "-") ||
        c.name.toLowerCase() === category.toLowerCase() ||
        c.id === category,
    );

    if (!cat) {
      return {
        category,
        stage: "detected",
        signals: [
          {
            signal: "Category not found in tracked categories",
            value: "unknown",
            direction: "neutral",
          },
        ],
        transitionProbability: {
          detected: 1.0,
          trend_validated: 0,
          keywords_learned: 0,
          ready_for_promotion: 0,
          promoted: 0,
          retired: 0,
        },
        recommendedActions: [
          "Monitor for mentions across video content",
          "Begin keyword learning once 50+ product mentions detected",
        ],
        nextStage: null,
        convergenceScore: 0,
        weeksInCurrentStage: 0,
      };
    }

    // Build candidate for lifecycle evaluation
    const candidate: CandidateForPromotion = {
      id: cat.id,
      candidateName: cat.name,
      candidateKey: cat.key,
      convergenceScore:
        cat.recentConvergenceScores.length > 0
          ? cat.recentConvergenceScores[cat.recentConvergenceScores.length - 1]!
          : 0,
      productMentionCount: cat.productMentionCount,
      videoMentionCount: cat.videoMentionCount,
      learnedKeywords: JSON.stringify({
        primary: cat.primaryKeywords,
        secondary: cat.secondaryKeywords,
        exclusion: [],
      }),
      keywordConfidence: cat.keywordConfidence,
    };

    // Determine next stage
    const nextStage = this.lifecycleManager.determineNextStage(
      cat.stage,
      candidate,
    );

    // Generate signals
    const signals = this.generateLifecycleSignals(cat);

    // Calculate transition probabilities
    const transitionProbability = this.calculateTransitionProbabilities(
      cat.stage,
      candidate,
    );

    // Generate recommended actions
    const actions = this.generateLifecycleActions(cat.stage, cat);

    // Estimate weeks in current stage from convergence score trend
    const weeksInCurrentStage = Math.min(
      cat.recentConvergenceScores.length,
      52,
    );

    const latestConvergence =
      cat.recentConvergenceScores.length > 0
        ? cat.recentConvergenceScores[cat.recentConvergenceScores.length - 1]!
        : 0;

    return {
      category: cat.name,
      stage: cat.stage,
      signals,
      transitionProbability,
      recommendedActions: actions,
      nextStage: nextStage !== cat.stage ? nextStage : null,
      convergenceScore: latestConvergence,
      weeksInCurrentStage,
    };
  }

  // ==========================================================================
  // Tool 12: get_seasonal_calendar
  // ==========================================================================

  /**
   * Region-specific commerce calendar with demand multipliers.
   */
  getSeasonalCalendar(
    region: string,
    monthsAhead: number = 3,
  ): SeasonalCalendarResult {
    this.logger.info("Getting seasonal calendar", { region, monthsAhead });

    // Determine hemisphere from region
    const hemisphere = this.getHemisphere(region);
    const currentSeason = getCurrentSeason(hemisphere);
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + monthsAhead);

    // Get default gardening promotions
    const templates = getDefaultGardeningPromotions();
    const currentYear = now.getFullYear();

    // Build promotions for current and next year (to cover year boundaries)
    const allPromotions: Array<{
      template: DefaultPromotionTemplate;
      input: ReturnType<typeof buildPromotionFromTemplate>;
    }> = [];

    for (const year of [currentYear, currentYear + 1]) {
      for (const template of templates) {
        const promoInput = buildPromotionFromTemplate(template, year);
        allPromotions.push({ template, input: promoInput });
      }
    }

    // Filter to promotions that overlap with the requested window and region
    const regionUpper = region.toUpperCase();
    const events = allPromotions
      .filter(({ input }) => {
        const promoStart = new Date(input.startDate);
        const promoEnd = new Date(input.endDate);
        // Overlaps with the requested window
        const overlaps = promoStart <= endDate && promoEnd >= now;
        // Matches region (GLOBAL matches everything)
        const regionMatch =
          !input.region ||
          input.region === "GLOBAL" ||
          input.region === regionUpper;
        return overlaps && regionMatch;
      })
      .map(({ template, input }) => {
        const promoStart = new Date(input.startDate);
        const promoEnd = new Date(input.endDate);
        const isLive = now >= promoStart && now <= promoEnd;
        const msRemaining = Math.max(0, promoEnd.getTime() - now.getTime());
        const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));

        // Demand multiplier based on type and proximity
        const demandMultiplier = this.calculateDemandMultiplier(
          template,
          isLive,
          daysRemaining,
        );

        return {
          title: input.title,
          description: input.description ?? "",
          type: input.type,
          startDate: promoStart.toISOString().split("T")[0]!,
          endDate: promoEnd.toISOString().split("T")[0]!,
          isLive,
          daysRemaining,
          demandMultiplier,
          categories: input.categories ?? [],
          keywords: input.keywords ?? [],
          badgeText: input.badgeText,
          badgeColor: input.badgeColor,
          featured: input.featured ?? false,
          region: input.region,
        };
      })
      .sort((a, b) => {
        // Live events first, then by start date
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      });

    // Filter ethnobotanical events to the requested window
    const currentMonth = now.getMonth() + 1;
    const endMonth = endDate.getMonth() + 1;
    const ethnoEvents = DEFAULT_ETHNOBOTANICAL_EVENTS
      .filter((e) => {
        // Region filter
        if (e.region !== "GLOBAL" && e.region !== regionUpper) return false;
        // Month range filter (handle year boundary)
        if (endMonth >= currentMonth) {
          return e.month >= currentMonth && e.month <= endMonth;
        }
        // Wraps around year boundary
        return e.month >= currentMonth || e.month <= endMonth;
      })
      .map((e) => ({
        event: e.event,
        month: e.month,
        plants: e.plantsInvolved,
        priority: e.priority,
      }));

    return {
      region: regionUpper,
      hemisphere,
      currentSeason,
      monthsAhead,
      events,
      ethnobotanicalEvents: ethnoEvents,
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Create a heuristic evaluator for a specific criterion.
   * These provide baseline scores without external data.
   */
  private createHeuristicEvaluator(
    criterionId: string,
    _channel: ChannelForVetting,
  ): CriterionEvaluator {
    return async (channel: ChannelForVetting): Promise<CriterionResult> => {
      // Heuristic scoring based on available channel data
      let score = 50; // baseline
      let confidence = 0.3; // low confidence without external data
      const evidence: string[] = [];
      const flags: string[] = [];

      switch (criterionId) {
        case "published_books":
          score = 30;
          confidence = 0.2;
          evidence.push("No book verification data available");
          break;

        case "editorial_vetting":
          score = 50;
          confidence = 0.3;
          evidence.push("Baseline score -- no editorial vetting data available");
          break;

        case "media_presence":
          if (channel.subscriberCount) {
            if (channel.subscriberCount > 100000) {
              score = 80;
              confidence = 0.7;
              evidence.push(
                `${channel.subscriberCount.toLocaleString()} subscribers`,
              );
            } else if (channel.subscriberCount > 10000) {
              score = 60;
              confidence = 0.6;
              evidence.push(
                `${channel.subscriberCount.toLocaleString()} subscribers`,
              );
            } else {
              score = 35;
              confidence = 0.5;
              evidence.push(
                `${channel.subscriberCount.toLocaleString()} subscribers`,
              );
            }
          } else {
            evidence.push("Subscriber count not available");
          }
          break;

        case "professional_credentials":
          score = 40;
          confidence = 0.2;
          evidence.push("No credential data available -- requires manual check");
          flags.push("credentials_unverified");
          break;

        case "institutional_affiliation":
          score = 35;
          confidence = 0.2;
          evidence.push("No affiliation data available");
          break;

        case "ethical_alignment":
          score = 55;
          confidence = 0.3;
          evidence.push("Baseline ethical alignment score");
          break;

        case "production_quality":
          if (channel.videoCount) {
            // More videos often correlates with consistent production
            score = Math.min(80, 40 + channel.videoCount * 0.2);
            confidence = 0.5;
            evidence.push(`${channel.videoCount} videos published`);
          } else {
            evidence.push("Video count not available");
          }
          break;
      }

      return {
        criterionId: criterionId as CriterionResult["criterionId"],
        score,
        confidence,
        evidence,
        flags,
      };
    };
  }

  /**
   * Map 7-criterion results to the 5-dimension MCP output format.
   */
  private mapToFiveDimensions(
    criteria: CriterionResult[],
  ): ChannelAuthorityResult["scores"] {
    const findScore = (id: string): number =>
      criteria.find((c) => c.criterionId === id)?.score ?? 0;

    return {
      reach: findScore("media_presence"),
      engagement: Math.round(
        (findScore("production_quality") + findScore("editorial_vetting")) / 2,
      ),
      quality: Math.round(
        (findScore("professional_credentials") +
          findScore("editorial_vetting")) /
          2,
      ),
      trust: Math.round(
        (findScore("published_books") +
          findScore("institutional_affiliation") +
          findScore("ethical_alignment")) /
          3,
      ),
      commercial: Math.round(
        (findScore("production_quality") + findScore("media_presence")) / 2,
      ),
    };
  }

  /**
   * Estimate overlap between two categories using keyword similarity
   * and seed data heuristics.
   */
  private estimateOverlap(
    a: CategoryAffinityInput,
    b: CategoryAffinityInput,
  ): OverlapData {
    // Use keyword overlap as a proxy for video/commerce/creator overlap
    const allA = new Set(
      [...a.primaryKeywords, ...a.secondaryKeywords].map((k) =>
        k.toLowerCase(),
      ),
    );
    const allB = new Set(
      [...b.primaryKeywords, ...b.secondaryKeywords].map((k) =>
        k.toLowerCase(),
      ),
    );

    const intersection = [...allA].filter((k) => allB.has(k)).length;
    const union = new Set([...allA, ...allB]).size;
    const keywordSimilarity = union > 0 ? (intersection / union) * 100 : 0;

    // Parent-child categories have higher overlap
    const isRelated =
      a.parentCategoryId === b.categoryId ||
      b.parentCategoryId === a.categoryId;
    const relatedBonus = isRelated ? 25 : 0;

    return {
      videoOverlap: Math.min(100, keywordSimilarity * 0.8 + relatedBonus),
      commerceOverlap: Math.min(100, keywordSimilarity * 0.6 + relatedBonus),
      creatorOverlap: Math.min(100, keywordSimilarity * 0.5 + relatedBonus * 0.5),
      audienceOverlap: Math.min(100, keywordSimilarity * 0.7 + relatedBonus),
    };
  }

  /**
   * Build expansion paths from affinity data.
   */
  private buildExpansionPaths(
    sourceCategoryId: string,
    allAffinities: Array<{
      categoryAId: string;
      categoryBId: string;
      result: AffinityResult;
    }>,
    maxDepth: number,
  ): CategoryAffinityResult["expansionPaths"] {
    const paths: CategoryAffinityResult["expansionPaths"] = [];

    // Find directly connected categories
    const directConnections = allAffinities
      .filter(
        (pair) =>
          (pair.categoryAId === sourceCategoryId ||
            pair.categoryBId === sourceCategoryId) &&
          pair.result.affinityScore >= 20,
      )
      .sort((a, b) => b.result.affinityScore - a.result.affinityScore);

    for (const conn of directConnections.slice(0, 5)) {
      const targetId =
        conn.categoryAId === sourceCategoryId
          ? conn.categoryBId
          : conn.categoryAId;
      const targetCat = this.categories.find((c) => c.id === targetId);
      const sourceCat = this.categories.find(
        (c) => c.id === sourceCategoryId,
      );

      const path = [sourceCat?.name ?? sourceCategoryId, targetCat?.name ?? targetId];

      // For deeper paths, find second-hop connections
      if (maxDepth >= 2) {
        const secondHops = allAffinities
          .filter(
            (pair) =>
              (pair.categoryAId === targetId ||
                pair.categoryBId === targetId) &&
              pair.categoryAId !== sourceCategoryId &&
              pair.categoryBId !== sourceCategoryId &&
              pair.result.affinityScore >= 15,
          )
          .sort((a, b) => b.result.affinityScore - a.result.affinityScore);

        const bestSecondHop = secondHops[0];
        if (bestSecondHop) {
          const secondTargetId =
            bestSecondHop.categoryAId === targetId
              ? bestSecondHop.categoryBId
              : bestSecondHop.categoryAId;
          const secondTargetCat = this.categories.find(
            (c) => c.id === secondTargetId,
          );
          path.push(secondTargetCat?.name ?? secondTargetId);
        }
      }

      const totalAffinity = conn.result.affinityScore;
      let recommendation: string;
      if (totalAffinity >= 50) {
        recommendation = "Strong cross-sell opportunity -- audiences highly overlap";
      } else if (totalAffinity >= 30) {
        recommendation = "Moderate affinity -- test with related content";
      } else {
        recommendation = "Weak connection -- monitor for emerging crossover";
      }

      paths.push({ path, totalAffinity, recommendation });
    }

    return paths;
  }

  /**
   * Generate lifecycle signals from seed category data.
   */
  private generateLifecycleSignals(
    cat: SeedCategory,
  ): CategoryLifecycleResult["signals"] {
    const signals: CategoryLifecycleResult["signals"] = [];

    // Demand signal
    const demandDirection =
      cat.demandScore >= 75
        ? "positive"
        : cat.demandScore >= 50
          ? "neutral"
          : ("negative" as const);
    signals.push({
      signal: "Demand score",
      value: cat.demandScore,
      direction: demandDirection,
    });

    // Convergence trend
    if (cat.recentConvergenceScores.length >= 4) {
      const recent = cat.recentConvergenceScores.slice(-4);
      const older = cat.recentConvergenceScores.slice(-8, -4);
      if (older.length > 0) {
        const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
        const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
        const change = ((recentAvg - olderAvg) / Math.max(olderAvg, 1)) * 100;
        signals.push({
          signal: "Convergence trend (4-week)",
          value: `${change > 0 ? "+" : ""}${change.toFixed(1)}%`,
          direction: change > 5 ? "positive" : change < -5 ? "negative" : "neutral",
        });
      }
    }

    // Product mentions
    signals.push({
      signal: "Product mentions",
      value: cat.productMentionCount,
      direction: cat.productMentionCount >= 100 ? "positive" : "neutral",
    });

    // Video mentions
    signals.push({
      signal: "Video mentions",
      value: cat.videoMentionCount,
      direction: cat.videoMentionCount >= 10 ? "positive" : "neutral",
    });

    // Keyword confidence
    signals.push({
      signal: "Keyword confidence",
      value: `${(cat.keywordConfidence * 100).toFixed(0)}%`,
      direction: cat.keywordConfidence >= 0.75 ? "positive" : "neutral",
    });

    // Competition level
    signals.push({
      signal: "Competition",
      value: cat.competitorCount,
      direction: cat.competitorCount < 15 ? "positive" : cat.competitorCount > 30 ? "negative" : "neutral",
    });

    return signals;
  }

  /**
   * Calculate transition probabilities for a lifecycle stage.
   */
  private calculateTransitionProbabilities(
    currentStage: LifecycleStage,
    candidate: CandidateForPromotion,
  ): Record<string, number> {
    const probs: Record<string, number> = {
      detected: 0,
      trend_validated: 0,
      keywords_learned: 0,
      ready_for_promotion: 0,
      promoted: 0,
      retired: 0,
    };

    switch (currentStage) {
      case "detected":
        probs["detected"] = 0.5;
        probs["trend_validated"] = candidate.convergenceScore >= 25 ? 0.4 : 0.1;
        probs["retired"] = 0.1;
        break;
      case "trend_validated":
        probs["trend_validated"] = 0.4;
        probs["keywords_learned"] = candidate.keywordConfidence !== null && candidate.keywordConfidence >= 0.5 ? 0.5 : 0.1;
        probs["retired"] = 0.1;
        break;
      case "keywords_learned":
        probs["keywords_learned"] = 0.3;
        probs["ready_for_promotion"] = candidate.convergenceScore >= 50 ? 0.5 : 0.1;
        probs["promoted"] = candidate.convergenceScore >= 50 ? 0.1 : 0;
        probs["retired"] = 0.1;
        break;
      case "ready_for_promotion":
        probs["ready_for_promotion"] = 0.3;
        probs["promoted"] = 0.6;
        probs["retired"] = 0.1;
        break;
      case "promoted":
        probs["promoted"] = 0.85;
        probs["retired"] = 0.15;
        break;
      case "retired":
        probs["retired"] = 0.9;
        probs["detected"] = 0.1; // re-emergence possible
        break;
    }

    return probs;
  }

  /**
   * Generate recommended actions for a lifecycle stage.
   */
  private generateLifecycleActions(
    stage: LifecycleStage,
    cat: SeedCategory,
  ): string[] {
    switch (stage) {
      case "detected":
        return [
          "Monitor product mentions across new video content",
          "Begin collecting keyword candidates",
          `Current convergence: ${cat.recentConvergenceScores.length > 0 ? cat.recentConvergenceScores[cat.recentConvergenceScores.length - 1] : 0}. Target: 25 for trend validation.`,
        ];
      case "trend_validated":
        return [
          "Continue keyword learning from video transcripts",
          "Validate demand with search volume data",
          `Keyword confidence: ${(cat.keywordConfidence * 100).toFixed(0)}%. Target: 50% for promotion.`,
        ];
      case "keywords_learned":
        return [
          "Evaluate for promotion -- check convergence score stability",
          "Map affinity relationships to existing categories",
          "Identify affiliate programs for this category",
        ];
      case "ready_for_promotion":
        return [
          "Review for final promotion approval",
          "Prepare keyword configurations for preprocessor",
          "Set up affiliate tracking for this category",
        ];
      case "promoted":
        return [
          "Monitor convergence score for signs of decline",
          "Expand keyword coverage with new video content",
          "Track affiliate conversion rates",
          cat.recentConvergenceScores.length > 0 &&
          cat.recentConvergenceScores[cat.recentConvergenceScores.length - 1]! < 30
            ? "WARNING: Convergence declining -- evaluate for potential retirement"
            : "Category performing within expected range",
        ];
      case "retired":
        return [
          "Archive category data for historical analysis",
          "Monitor for potential re-emergence",
          "Redirect traffic to related active categories",
        ];
    }
  }

  /**
   * Determine hemisphere from region code.
   */
  private getHemisphere(region: string): "northern" | "southern" {
    const southern = ["AU", "NZ", "ZA", "BR", "AR", "CL"];
    return southern.includes(region.toUpperCase()) ? "southern" : "northern";
  }

  /**
   * Calculate demand multiplier for a promotion.
   */
  private calculateDemandMultiplier(
    template: DefaultPromotionTemplate,
    isLive: boolean,
    daysRemaining: number,
  ): number {
    let multiplier = 1.0;

    // Type-based multipliers
    if (template.type === "sale") multiplier = 2.0;
    else if (template.type === "seasonal") multiplier = 1.5;
    else if (template.type === "holiday") multiplier = 1.8;
    else if (template.type === "flash-deal") multiplier = 2.5;

    // Featured events get a boost
    if (template.featured) multiplier *= 1.2;

    // Live events get a boost
    if (isLive) multiplier *= 1.3;

    // Urgency boost for events ending soon
    if (isLive && daysRemaining <= 3) multiplier *= 1.5;
    else if (isLive && daysRemaining <= 7) multiplier *= 1.2;

    return Number(multiplier.toFixed(2));
  }

  /**
   * Built-in known gardening affiliate programs for demo/offline use.
   */
  private getKnownPrograms(
    category: string,
  ): Array<{
    id: number;
    name: string;
    description: string;
    terms: string;
    commission: { min: number; max: number };
    cookieDuration: number;
    avgOrderValue?: number;
    country?: string;
    region?: string;
  }> {
    const categoryLower = category.toLowerCase();

    // Base set of known gardening programs
    const programs = [
      {
        id: 1001,
        name: "Crocus Garden Centre",
        description: "UK's largest online garden centre. Plants, bulbs, seeds, tools, and garden furniture.",
        terms: "Garden plants, bulbs, seeds, garden tools, outdoor furniture",
        commission: { min: 4, max: 8 },
        cookieDuration: 30,
        avgOrderValue: 45,
        country: "United Kingdom",
        region: "UK",
      },
      {
        id: 1002,
        name: "Thompson & Morgan",
        description: "Seeds, plants, and gardening supplies since 1855.",
        terms: "Seeds, plants, gardening equipment, bulbs, seed potatoes",
        commission: { min: 5, max: 10 },
        cookieDuration: 30,
        avgOrderValue: 35,
        country: "United Kingdom",
        region: "UK",
      },
      {
        id: 1003,
        name: "Harrod Horticultural",
        description: "Premium raised beds, fruit cages, garden structures, and tools.",
        terms: "Raised beds, garden structures, tools, composting, plant supports",
        commission: { min: 6, max: 12 },
        cookieDuration: 45,
        avgOrderValue: 95,
        country: "United Kingdom",
        region: "UK",
      },
      {
        id: 1004,
        name: "Gardening Direct",
        description: "Plants, bedding plants, seeds, and gardening supplies at great prices.",
        terms: "Garden plants, bedding plants, seeds, compost, plant food",
        commission: { min: 3, max: 7 },
        cookieDuration: 30,
        avgOrderValue: 28,
        country: "United Kingdom",
        region: "UK",
      },
      {
        id: 1005,
        name: "Burgon & Ball",
        description: "Award-winning garden tools, hand tools, and accessories.",
        terms: "Garden tools, secateurs, trowels, hand tools, gardening gloves",
        commission: { min: 8, max: 15 },
        cookieDuration: 30,
        avgOrderValue: 32,
        country: "United Kingdom",
        region: "UK",
      },
      {
        id: 1006,
        name: "Bakker International",
        description: "Flower bulbs, seeds, plants, and garden accessories delivered across Europe.",
        terms: "Bulbs, flower bulbs, plants, seeds, garden accessories",
        commission: { min: 5, max: 10 },
        cookieDuration: 30,
        avgOrderValue: 40,
        country: "Netherlands",
        region: "EU",
      },
      {
        id: 1007,
        name: "Gardeners World Shop",
        description: "Official BBC Gardeners' World shop. Garden gifts, tools, and subscriptions.",
        terms: "Gardening books, garden tools, gifts, subscriptions, garden courses",
        commission: { min: 5, max: 8 },
        cookieDuration: 30,
        avgOrderValue: 30,
        country: "United Kingdom",
        region: "UK",
      },
      {
        id: 1008,
        name: "Hortcraft Tools",
        description: "Professional and garden tools for serious gardeners.",
        terms: "Professional garden tools, Japanese tools, secateurs, loppers, pruning",
        commission: { min: 7, max: 12 },
        cookieDuration: 45,
        avgOrderValue: 55,
        country: "United Kingdom",
        region: "UK",
      },
    ];

    // Filter by category relevance if a specific category was requested
    if (
      categoryLower.includes("tool") ||
      categoryLower.includes("equipment")
    ) {
      return programs.filter(
        (p) =>
          p.terms.toLowerCase().includes("tool") ||
          p.description.toLowerCase().includes("tool"),
      );
    }

    if (
      categoryLower.includes("seed") ||
      categoryLower.includes("bulb")
    ) {
      return programs.filter(
        (p) =>
          p.terms.toLowerCase().includes("seed") ||
          p.terms.toLowerCase().includes("bulb"),
      );
    }

    if (
      categoryLower.includes("raised bed") ||
      categoryLower.includes("structure")
    ) {
      return programs.filter(
        (p) =>
          p.terms.toLowerCase().includes("raised bed") ||
          p.terms.toLowerCase().includes("structure"),
      );
    }

    // Default: return all gardening programs
    return programs;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a MarketIntelligenceOrchestrator instance.
 */
export function createMarketIntelligenceOrchestrator(
  options?: MarketIntelOptions,
): MarketIntelligenceOrchestrator {
  return new MarketIntelligenceOrchestrator(options);
}
