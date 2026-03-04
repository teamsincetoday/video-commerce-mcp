/**
 * Hybrid Relevance Filter
 *
 * Smart combination of keyword-based (free) and AI-based (paid) filtering
 * to minimize OpenAI costs while maintaining high quality.
 *
 * Strategy:
 * 1. Use keyword filter for obvious matches (85% of programs)
 * 2. Only use AI for edge cases where keyword filter is uncertain
 *
 * Expected Cost Reduction: 70-85% (from $0.05 to $0.01 per scan)
 * Expected Accuracy: 92-95% (nearly same as AI-only)
 *
 * Ported from monolith: lib/services/affiliate-auto-discovery/hybrid-filter.ts
 * Removed: logger import, keyword-based-filter import (inlined).
 * Made OpenAI configurable via AIClient interface.
 */

import type { AIClient, Logger } from "../types.js";
import { defaultLogger } from "../types.js";

// ============================================================================
// TYPES
// ============================================================================

export interface HybridFilterConfig {
  /** Accept without AI if keyword score >= this (default: 80) */
  highConfidenceThreshold: number;
  /** Reject without AI if keyword score <= this (default: 20) */
  lowConfidenceThreshold: number;
  /** AI usage mode */
  aiMode: "hybrid" | "keyword-only" | "ai-only";
  /** Enable location extraction via AI (more expensive) */
  enableAILocationExtraction: boolean;
}

export interface KeywordRelevanceResult {
  isRelevant: boolean;
  relevanceScore: number; // 0-100
  reason: string;
  verticals: {
    supportsPlants: boolean;
    supportsSeeds: boolean;
    supportsTools: boolean;
    supportsMaterials: boolean;
    supportsBooks: boolean;
    supportsMedia: boolean;
    supportsCourses: boolean;
    supportsEvents: boolean;
    supportsGardenShows: boolean;
  };
  matchedKeywords: string[];
}

export interface HybridFilterStats {
  totalProcessed: number;
  keywordOnly: number;
  aiCalls: number;
  costSaved: number;
}

const DEFAULT_CONFIG: HybridFilterConfig = {
  highConfidenceThreshold: 80,
  lowConfidenceThreshold: 20,
  aiMode: "hybrid",
  enableAILocationExtraction: false,
};

// ============================================================================
// BUILT-IN KEYWORD FILTER
// ============================================================================

/** Gardening-related keywords for relevance matching. */
const GARDENING_KEYWORDS: Record<string, string[]> = {
  plants: [
    "plant",
    "plants",
    "nursery",
    "nurseries",
    "flower",
    "flowers",
    "shrub",
    "tree",
    "bulb",
    "perennial",
    "annual",
    "succulent",
    "cactus",
    "fern",
    "palm",
    "orchid",
    "rose",
    "tulip",
    "hedge",
    "climber",
    "vine",
  ],
  seeds: [
    "seed",
    "seeds",
    "seedling",
    "germination",
    "propagation",
    "sowing",
  ],
  tools: [
    "garden tool",
    "gardening tool",
    "secateur",
    "pruner",
    "shears",
    "spade",
    "fork",
    "trowel",
    "hoe",
    "rake",
    "wheelbarrow",
    "lawnmower",
    "lawn mower",
    "strimmer",
    "chainsaw",
    "loppers",
  ],
  materials: [
    "compost",
    "fertilizer",
    "fertiliser",
    "mulch",
    "soil",
    "peat",
    "bark",
    "gravel",
    "membrane",
    "fleece",
    "netting",
    "pot",
    "planter",
    "raised bed",
    "grow bag",
  ],
  books: [
    "gardening book",
    "garden book",
    "horticulture book",
    "botanical book",
  ],
  courses: [
    "gardening course",
    "horticulture course",
    "RHS",
    "master gardener",
  ],
  events: [
    "garden show",
    "flower show",
    "chelsea",
    "hampton court",
    "tatton",
  ],
  general: [
    "garden",
    "gardening",
    "horticulture",
    "botanical",
    "allotment",
    "greenhouse",
    "polytunnel",
    "conservatory",
    "landscape",
    "landscaping",
  ],
};

/**
 * Simple keyword-based relevance analysis (no AI cost).
 */
function analyzeKeywordRelevance(
  programName: string,
  description: string = "",
  programTerms: string = "",
): KeywordRelevanceResult {
  const text =
    `${programName} ${description} ${programTerms}`.toLowerCase();
  const matchedKeywords: string[] = [];
  const verticalHits: Record<string, boolean> = {};

  for (const [category, keywords] of Object.entries(GARDENING_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
        verticalHits[category] = true;
      }
    }
  }

  // Score based on matches
  const uniqueCategories = Object.keys(verticalHits).length;
  const keywordCount = matchedKeywords.length;

  let relevanceScore = 0;
  if (keywordCount >= 5) relevanceScore = 90;
  else if (keywordCount >= 3) relevanceScore = 75;
  else if (keywordCount >= 2) relevanceScore = 60;
  else if (keywordCount >= 1) relevanceScore = 40;

  // Bonus for multiple categories
  if (uniqueCategories >= 3) relevanceScore = Math.min(100, relevanceScore + 10);

  const isRelevant = relevanceScore >= 50;

  return {
    isRelevant,
    relevanceScore,
    reason: isRelevant
      ? `Matched ${keywordCount} keywords across ${uniqueCategories} categories`
      : `Only ${keywordCount} keyword matches (threshold: 2)`,
    verticals: {
      supportsPlants: !!verticalHits["plants"],
      supportsSeeds: !!verticalHits["seeds"],
      supportsTools: !!verticalHits["tools"],
      supportsMaterials: !!verticalHits["materials"],
      supportsBooks: !!verticalHits["books"],
      supportsMedia: false,
      supportsCourses: !!verticalHits["courses"],
      supportsEvents: !!verticalHits["events"],
      supportsGardenShows: !!verticalHits["events"],
    },
    matchedKeywords,
  };
}

// ============================================================================
// HYBRID FILTER CLASS
// ============================================================================

export class HybridRelevanceFilter {
  private aiClient?: AIClient;
  private config: HybridFilterConfig;
  private stats: HybridFilterStats = {
    totalProcessed: 0,
    keywordOnly: 0,
    aiCalls: 0,
    costSaved: 0,
  };
  private logger: Logger;

  constructor(
    aiClient?: AIClient,
    config: Partial<HybridFilterConfig> = {},
    logger: Logger = defaultLogger,
  ) {
    this.aiClient = aiClient;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Main filtering method with cost optimization.
   */
  async analyzeRelevance(
    programName: string,
    description: string = "",
    programTerms: string = "",
  ): Promise<KeywordRelevanceResult> {
    this.stats.totalProcessed++;

    // Force keyword-only if no AI client
    if (!this.aiClient || this.config.aiMode === "keyword-only") {
      this.stats.keywordOnly++;
      return analyzeKeywordRelevance(programName, description, programTerms);
    }

    // Force AI-only mode
    if (this.config.aiMode === "ai-only") {
      this.stats.aiCalls++;
      return this.analyzeWithAI(programName, description, programTerms);
    }

    // HYBRID MODE
    const keywordResult = analyzeKeywordRelevance(
      programName,
      description,
      programTerms,
    );

    // High confidence: trust keyword filter
    if (keywordResult.relevanceScore >= this.config.highConfidenceThreshold) {
      this.stats.keywordOnly++;
      this.stats.costSaved += 0.001;
      return keywordResult;
    }

    // Low confidence: reject without AI
    if (keywordResult.relevanceScore <= this.config.lowConfidenceThreshold) {
      this.stats.keywordOnly++;
      this.stats.costSaved += 0.001;
      return keywordResult;
    }

    // Edge case: use AI
    this.stats.aiCalls++;
    this.logger.info("Uncertain confidence, using AI", {
      relevanceScore: keywordResult.relevanceScore,
      programName,
    });
    return this.analyzeWithAI(programName, description, programTerms);
  }

  /**
   * AI-based analysis (only for edge cases).
   */
  private async analyzeWithAI(
    programName: string,
    description: string,
    programTerms: string,
  ): Promise<KeywordRelevanceResult> {
    if (!this.aiClient) {
      throw new Error("AI client not configured");
    }

    const prompt = `Analyze if this affiliate program is relevant for a gardening YouTube channel that covers topics like: plants, seeds, garden tools, gardening books, courses, materials (compost, fertilizers), and garden shows/events.

Program Name: ${programName}
Description: ${description || "No description provided"}
Program Terms: ${programTerms}

Respond in JSON format:
{
  "isRelevant": boolean,
  "relevanceScore": number (0-100),
  "reason": "brief explanation",
  "verticals": {
    "supportsPlants": boolean,
    "supportsSeeds": boolean,
    "supportsTools": boolean,
    "supportsMaterials": boolean,
    "supportsBooks": boolean,
    "supportsMedia": boolean,
    "supportsCourses": boolean,
    "supportsEvents": boolean,
    "supportsGardenShows": boolean
  }
}

Be strict: only mark as relevant if directly related to gardening, not general home/lifestyle.`;

    try {
      const response = await this.aiClient.complete({
        systemPrompt:
          "You are an expert at analyzing affiliate programs for relevance to gardening content. Respond only with valid JSON.",
        userPrompt: prompt,
        model: "gpt-4o-mini",
        temperature: 0.3,
        maxTokens: 500,
      });

      const analysis = JSON.parse(response.content);
      return {
        isRelevant: analysis.isRelevant,
        relevanceScore: analysis.relevanceScore,
        reason: analysis.reason,
        verticals: analysis.verticals,
        matchedKeywords: [],
      };
    } catch (error) {
      this.logger.error(
        "AI analysis failed, falling back to keyword filter",
        error instanceof Error ? error : undefined,
      );
      return analyzeKeywordRelevance(programName, description, programTerms);
    }
  }

  /**
   * Get cost savings statistics.
   */
  getStats(): HybridFilterStats & {
    aiCallPercentage: string;
    costPerScan: string;
    totalCostSaved: string;
  } {
    const aiCallPercentage =
      this.stats.totalProcessed > 0
        ? (this.stats.aiCalls / this.stats.totalProcessed) * 100
        : 0;

    return {
      ...this.stats,
      aiCallPercentage: aiCallPercentage.toFixed(1) + "%",
      costPerScan: (this.stats.aiCalls * 0.001).toFixed(4),
      totalCostSaved: this.stats.costSaved.toFixed(4),
    };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      totalProcessed: 0,
      keywordOnly: 0,
      aiCalls: 0,
      costSaved: 0,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Factory function with presets.
 */
export function createHybridFilter(
  aiClient?: AIClient,
  preset:
    | "aggressive-cost-saving"
    | "balanced"
    | "quality-first" = "balanced",
  logger?: Logger,
): HybridRelevanceFilter {
  const presets: Record<string, Partial<HybridFilterConfig>> = {
    "aggressive-cost-saving": {
      highConfidenceThreshold: 70,
      lowConfidenceThreshold: 30,
      aiMode: "hybrid",
      enableAILocationExtraction: false,
    },
    balanced: {
      highConfidenceThreshold: 80,
      lowConfidenceThreshold: 20,
      aiMode: "hybrid",
      enableAILocationExtraction: false,
    },
    "quality-first": {
      highConfidenceThreshold: 90,
      lowConfidenceThreshold: 10,
      aiMode: "hybrid",
      enableAILocationExtraction: true,
    },
  };

  return new HybridRelevanceFilter(aiClient, presets[preset], logger);
}
