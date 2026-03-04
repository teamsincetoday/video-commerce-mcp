/**
 * Autonomous Category Discovery System
 *
 * Automatically discovers new product categories from product/commerce item patterns,
 * eliminating manual category expansion and reducing "OTHER" category usage.
 *
 * PIPELINE:
 * 1. Pattern Detection - Cluster "OTHER" products by keyword similarity
 * 2. Trend Validation - Apply Three Forces model (demand x commission x authority)
 * 3. Keyword Learning - Extract keywords from high-confidence products
 * 4. Affinity Analysis - Calculate relationships to existing categories
 * 5. Auto-Promotion - Promote high-scoring candidates to active categories
 *
 * TARGET: Reduce "OTHER" usage from 100% to <5% over 6-12 months
 *
 * Ported from monolith: lib/services/autonomous-category-discovery.ts
 * Removed: Prisma, click-intelligence import, logger import.
 * All data access replaced with constructor-injected data or method parameters.
 */

import type { Logger } from "../types.js";
import { defaultLogger } from "../types.js";

// ============================================================================
// TYPES
// ============================================================================

export interface DiscoveryConfig {
  /** Min products to form cluster (default: 50) */
  minProductMentions?: number;
  /** Min videos mentioning cluster (default: 10) */
  minVideoMentions?: number;
  /** Cosine similarity threshold (default: 0.7) */
  similarityThreshold?: number;
  /** Min demand to pass validation (default: 30) */
  minDemandScore?: number;
  /** Min commission to pass (default: 20) */
  minCommissionScore?: number;
  /** Min authority to pass (default: 20) */
  minAuthorityScore?: number;
  /** Min convergence for promotion (default: 50) */
  minConvergenceScore?: number;
  /** Min time before promotion in weeks (default: 4) */
  minWeeksInPipeline?: number;
  /** Require admin approval (default: false) */
  requireManualApproval?: boolean;
  /** Enable auto-promotion (default: true) */
  autoPromotionEnabled?: boolean;
}

export interface PatternCluster {
  clusterName: string;
  clusterKey: string;
  productCount: number;
  videoCount: number;
  sampleProducts: string[];
  keywords: string[];
  avgConfidence: number;
}

export interface DiscoveryResult {
  runType:
    | "daily_pattern_detection"
    | "weekly_validation"
    | "monthly_promotion";
  status: "completed" | "failed";
  candidatesDetected: number;
  candidatesValidated: number;
  candidatesPromoted: number;
  candidatesRejected: number;
  productsReclassified: number;
  executionTimeMs: number;
  errors?: string[];
  debugLog: string[];
}

/** A product in the "OTHER" category to be analyzed. */
export interface UncategorizedProduct {
  id: string;
  name: string;
  videoId: string;
  confidence: number;
}

/** A candidate category with its validation scores. */
export interface CandidateCategory {
  candidateKey: string;
  candidateName: string;
  productMentionCount: number;
  videoMentionCount: number;
  avgConfidence: number;
  affiliateProgramCount: number;

  // Scores (set during validation)
  demandScore?: number;
  commissionScore?: number;
  authorityScore?: number;
  convergenceScore?: number;
  trendDirection?: string;
}

/** Three Forces scores for a candidate. */
export interface ThreeForcesScores {
  demand: number;
  commission: number;
  authority: number;
  convergence: number;
  competition: number;
  trendDirection: string;
  velocity: number;
  weeklyGrowthRate: number;
}

// ============================================================================
// STOP WORDS
// ============================================================================

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "pack",
  "set",
]);

// ============================================================================
// AUTONOMOUS DISCOVERY CLASS
// ============================================================================

export class AutonomousCategoryDiscovery {
  private config: Required<
    Omit<DiscoveryConfig, "dateRangeStart" | "dateRangeEnd">
  >;
  private debugLog: string[] = [];
  private logger: Logger;

  constructor(config: DiscoveryConfig = {}, logger: Logger = defaultLogger) {
    this.logger = logger;
    this.config = {
      minProductMentions: config.minProductMentions ?? 50,
      minVideoMentions: config.minVideoMentions ?? 10,
      similarityThreshold: config.similarityThreshold ?? 0.7,
      minDemandScore: config.minDemandScore ?? 30,
      minCommissionScore: config.minCommissionScore ?? 20,
      minAuthorityScore: config.minAuthorityScore ?? 20,
      minConvergenceScore: config.minConvergenceScore ?? 50,
      minWeeksInPipeline: config.minWeeksInPipeline ?? 4,
      requireManualApproval: config.requireManualApproval ?? false,
      autoPromotionEnabled: config.autoPromotionEnabled ?? true,
    };
  }

  /**
   * Run daily pattern detection on a list of uncategorized products.
   * Returns detected pattern clusters.
   */
  runPatternDetection(products: UncategorizedProduct[]): {
    clusters: PatternCluster[];
    debugLog: string[];
  } {
    const startTime = Date.now();
    this.debugLog = [];
    this.log(`Starting pattern detection on ${products.length} products...`);

    if (products.length < this.config.minProductMentions) {
      this.log(
        `Not enough products for clustering (need ${this.config.minProductMentions})`,
      );
      return { clusters: [], debugLog: this.debugLog };
    }

    const clusters = this.clusterProducts(products);
    this.log(
      `Pattern detection completed in ${Date.now() - startTime}ms. Found ${clusters.length} clusters.`,
    );

    return { clusters, debugLog: this.debugLog };
  }

  /**
   * Validate candidates using Three Forces model.
   * Returns validated candidates with convergence scores.
   */
  validateCandidates(
    candidates: CandidateCategory[],
  ): Array<CandidateCategory & { validated: boolean }> {
    this.debugLog = [];
    this.log(`Validating ${candidates.length} candidates...`);

    return candidates.map((candidate) => {
      const scores = this.calculateThreeForces(candidate);
      const validated =
        scores.convergence >= this.config.minConvergenceScore / 2;

      this.log(
        `${validated ? "Validated" : "Needs more data"}: ${candidate.candidateName} (convergence: ${scores.convergence.toFixed(1)})`,
      );

      return {
        ...candidate,
        demandScore: scores.demand,
        commissionScore: scores.commission,
        authorityScore: scores.authority,
        convergenceScore: scores.convergence,
        trendDirection: scores.trendDirection,
        validated,
      };
    });
  }

  // ==========================================================================
  // CLUSTERING
  // ==========================================================================

  /**
   * Cluster products by keyword similarity.
   */
  private clusterProducts(products: UncategorizedProduct[]): PatternCluster[] {
    this.log("Clustering products by keyword similarity...");

    const productKeywords = products.map((p) => ({
      id: p.id,
      name: p.name,
      keywords: this.extractKeywords(p.name),
      videoId: p.videoId,
      confidence: p.confidence,
    }));

    // Group by primary keyword (simple clustering)
    const keywordGroups = new Map<string, typeof productKeywords>();

    for (const product of productKeywords) {
      const primaryKeyword = product.keywords[0];
      if (!primaryKeyword) continue;

      if (!keywordGroups.has(primaryKeyword)) {
        keywordGroups.set(primaryKeyword, []);
      }
      keywordGroups.get(primaryKeyword)!.push(product);
    }

    // Convert groups to clusters
    const clusters: PatternCluster[] = [];

    for (const [, group] of keywordGroups.entries()) {
      if (group.length < this.config.minProductMentions) continue;

      const videoIds = new Set(group.map((p) => p.videoId));
      if (videoIds.size < this.config.minVideoMentions) continue;

      // Extract common keywords
      const allKeywords = group.flatMap((p) => p.keywords);
      const keywordFreq = new Map<string, number>();
      for (const kw of allKeywords) {
        keywordFreq.set(kw, (keywordFreq.get(kw) || 0) + 1);
      }

      const commonKeywords = Array.from(keywordFreq.entries())
        .filter(([, count]) => count >= group.length * 0.3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([kw]) => kw);

      const clusterName = this.generateClusterName(commonKeywords);
      const clusterKey = this.slugify(clusterName);

      clusters.push({
        clusterName,
        clusterKey,
        productCount: group.length,
        videoCount: videoIds.size,
        sampleProducts: group.slice(0, 10).map((p) => p.name),
        keywords: commonKeywords,
        avgConfidence:
          group.reduce((sum, p) => sum + p.confidence, 0) / group.length,
      });
    }

    return clusters;
  }

  // ==========================================================================
  // THREE FORCES CALCULATION
  // ==========================================================================

  /**
   * Calculate Three Forces scores for a candidate.
   */
  private calculateThreeForces(
    candidate: CandidateCategory,
  ): ThreeForcesScores {
    // DEMAND SCORE (0-100)
    const demandScore = Math.min(
      100,
      (candidate.productMentionCount / 100) * 40 +
        (candidate.videoMentionCount / 20) * 40 +
        20,
    );

    // COMMISSION SCORE (0-100)
    const commissionScore = Math.min(
      100,
      candidate.affiliateProgramCount * 20,
    );

    // AUTHORITY SCORE (0-100)
    const authorityScore = Math.min(
      100,
      candidate.avgConfidence * 80 + 20,
    );

    // CONVERGENCE: (demand x commission x authority) / 10000
    const convergence =
      (demandScore * commissionScore * authorityScore) / 10000;

    return {
      demand: demandScore,
      commission: commissionScore,
      authority: authorityScore,
      convergence,
      competition: 50, // Placeholder
      trendDirection: "stable",
      velocity: 0,
      weeklyGrowthRate: 0,
    };
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  /**
   * Extract keywords from product name.
   */
  extractKeywords(text: string): string[] {
    let normalized = text.toLowerCase();
    normalized = normalized.replace(/[^a-z0-9\s-]/g, " ");
    const words = normalized.split(/\s+/).filter((w) => w.length > 2);
    return words.filter((w) => !STOP_WORDS.has(w));
  }

  /**
   * Generate human-readable cluster name from keywords.
   */
  private generateClusterName(keywords: string[]): string {
    if (keywords.length === 0) return "Miscellaneous Products";
    const capitalized = keywords
      .slice(0, 3)
      .map((kw) => kw.charAt(0).toUpperCase() + kw.slice(1));
    return capitalized.join(" ");
  }

  /**
   * Slugify string for a key.
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
  }

  /**
   * Map candidate name to existing category for click data lookup.
   */
  mapCandidateToCategory(candidateName: string): string | null {
    const normalizedName = candidateName.toLowerCase();
    const categoryMappings: Record<string, string> = {
      plant: "PLANT",
      plants: "PLANT",
      seed: "SEEDS",
      seeds: "SEEDS",
      tool: "TOOLS",
      tools: "TOOLS",
      material: "MATERIALS",
      materials: "MATERIALS",
      structure: "STRUCTURES",
      structures: "STRUCTURES",
      book: "BOOKS",
      books: "BOOKS",
    };

    for (const [key, value] of Object.entries(categoryMappings)) {
      if (normalizedName.includes(key)) {
        return value;
      }
    }

    return "OTHER";
  }

  private log(message: string) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    this.debugLog.push(logEntry);
    this.logger.info(message, { service: "CategoryDiscovery" });
  }
}
