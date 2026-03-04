/**
 * Knowledge-Enhanced Preprocessor — Standalone domain-knowledge pre-filtering.
 *
 * Ported from monolith lib/services/knowledge-enhanced-preprocessor.ts.
 * Removes: Prisma, @/lib/logger, botanical-product-name-parser.
 * Keeps: All knowledge integration logic, entity hint system, adaptive keywords,
 *        disambiguation, market trend detection.
 *
 * KEY CHANGE: All database queries are replaced with data passed via
 * `initialize(data)`. Callers load their own data and pass it in.
 *
 * Enhancement over base class:
 * 1. Plant dictionary integration (loaded at initialization)
 * 2. Disambiguation rules (learned from entity corrections)
 * 3. Product catalog keywords (trending varieties from commerce)
 * 4. Market trend detection (emerging cultivars from popularity)
 * 5. Entity hints (pre-identified high-confidence entities with taxonomy)
 * 6. Adaptive keywords (dynamically adjusted based on video context)
 */

import { AdvancedTranscriptPreprocessor } from "./advanced-preprocessor.js";
import type {
  PreprocessingResult,
  PreprocessingOptions,
  KnowledgeEnhancedResult,
  KnowledgeSourcesUsed,
  EntityHint,
  PlantEntry,
  DisambiguationRule,
  ProductCatalogEntry,
  Logger,
} from "../types.js";
import { defaultLogger } from "../types.js";

// Re-export types for convenience
export type {
  KnowledgeEnhancedResult,
  KnowledgeSourcesUsed,
  EntityHint,
};

// ============================================================================
// INITIALIZATION DATA INTERFACE
// ============================================================================

/**
 * Data sources that callers pass in instead of Prisma queries.
 * All fields are optional -- the preprocessor degrades gracefully.
 */
export interface KnowledgeData {
  /** Plant dictionary entries (replaces prisma.plant.findMany) */
  plants?: PlantEntry[];
  /** Disambiguation rules (replaces prisma.disambiguationRule.findMany) */
  disambiguationRules?: DisambiguationRule[];
  /** Product catalog entries (replaces prisma.plantAffiliate.findMany) */
  productCatalog?: ProductCatalogEntry[];
  /** Recent product entries for trend detection (replaces prisma.plantAffiliate.findMany with date filter) */
  recentProducts?: ProductCatalogEntry[];
}

// ============================================================================
// KNOWLEDGE-ENHANCED PREPROCESSOR CLASS
// ============================================================================

export class KnowledgeEnhancedPreprocessor extends AdvancedTranscriptPreprocessor {
  private plantDictionary: Map<string, EntityHint> = new Map();
  private disambiguationRulesMap: Map<string, string[]> = new Map();
  private productKeywords: Set<string> = new Set();
  private marketTrends: Set<string> = new Set();
  private genusKeywords: Set<string> = new Set();
  private _initialized = false;

  constructor(options: PreprocessingOptions = {}, logger?: Logger) {
    super(options, logger);
  }

  /**
   * Initialize knowledge sources from provided data.
   * Replaces all Prisma queries with pure data loading.
   */
  async initialize(data: KnowledgeData = {}): Promise<void> {
    if (this._initialized) return;

    const log = this.logger ?? defaultLogger;
    log.info("Loading knowledge sources");
    const startTime = Date.now();

    if (data.plants) this.loadPlantDictionary(data.plants);
    if (data.disambiguationRules) this.loadDisambiguationRules(data.disambiguationRules);
    if (data.productCatalog) this.loadProductCatalogKeywords(data.productCatalog);
    if (data.recentProducts) this.loadMarketTrends(data.recentProducts);

    this._initialized = true;
    log.info("Knowledge-enhanced preprocessor initialized", {
      durationMs: Date.now() - startTime,
      plantDictionaryEntries: this.plantDictionary.size,
      disambiguationRules: this.disambiguationRulesMap.size,
      productKeywords: this.productKeywords.size,
      marketTrends: this.marketTrends.size,
      genusKeywords: this.genusKeywords.size,
    });
  }

  /**
   * Enhanced preprocessing with knowledge integration.
   * Pure function after initialization.
   */
  async preprocessWithKnowledge(
    transcript: string,
    videoId?: string,
  ): Promise<KnowledgeEnhancedResult> {
    // PHASE 1: Quick scan to identify entity hints
    const entityHints = this.extractEntityHints(transcript);

    // PHASE 2: Build adaptive keyword list based on hints
    const adaptiveKeywords = this.buildAdaptiveKeywordList(entityHints);

    // PHASE 3: Run standard preprocessing
    const result = await this.preprocess(transcript, videoId);

    // PHASE 4: Validate entity mentions against knowledge sources
    this.validateEntityMentions(result, entityHints);

    return {
      ...result,
      knowledgeSources: {
        plantDictionary: this.plantDictionary.size > 0,
        disambiguationRules: this.disambiguationRulesMap.size > 0,
        productCatalog: this.productKeywords.size > 0,
        authoritativeSources: true,
        marketTrends: this.marketTrends.size > 0,
      },
      entityHints,
      adaptiveKeywords,
    };
  }

  // ==========================================================================
  // KNOWLEDGE SOURCE LOADING (from data, not Prisma)
  // ==========================================================================

  /**
   * Load plant dictionary from provided data.
   */
  private loadPlantDictionary(plants: PlantEntry[]): void {
    for (const plant of plants) {
      // Add latin name
      this.addPlantDictionaryEntry(plant.latinName.toLowerCase(), {
        term: plant.latinName.toLowerCase(),
        source: "plant_dictionary",
        confidence: 1.0 - (plant.ambiguityScore ?? 0),
        latinName: plant.latinName,
        genus: plant.genus ?? undefined,
        species: plant.species ?? undefined,
        cultivar: plant.variety ?? undefined,
        priority: this.calculatePriority(plant.usageCount, plant.ambiguityScore),
      });

      // Add genus
      if (plant.genus) {
        this.genusKeywords.add(plant.genus.toLowerCase());
      }

      // Add common names
      for (const name of plant.commonNames) {
        this.addPlantDictionaryEntry(name.toLowerCase(), {
          term: name.toLowerCase(),
          source: "plant_dictionary",
          confidence: 0.9 - (plant.ambiguityScore ?? 0),
          latinName: plant.latinName,
          genus: plant.genus ?? undefined,
          species: plant.species ?? undefined,
          cultivar: plant.variety ?? undefined,
          priority: this.calculatePriority(plant.usageCount, plant.ambiguityScore),
        });
      }

      // Add synonyms
      for (const syn of plant.synonyms) {
        this.addPlantDictionaryEntry(syn.toLowerCase(), {
          term: syn.toLowerCase(),
          source: "plant_dictionary",
          confidence: 0.85 - (plant.ambiguityScore ?? 0),
          latinName: plant.latinName,
          genus: plant.genus ?? undefined,
          species: plant.species ?? undefined,
          cultivar: plant.variety ?? undefined,
          priority: "medium",
        });
      }

      // Add trade names
      for (const trade of plant.tradeNames) {
        this.addPlantDictionaryEntry(trade.toLowerCase(), {
          term: trade.toLowerCase(),
          source: "plant_dictionary",
          confidence: 0.80,
          latinName: plant.latinName,
          tradeNames: plant.tradeNames,
          priority: "medium",
        });
      }
    }
  }

  /**
   * Load disambiguation rules from provided data.
   */
  private loadDisambiguationRules(rules: DisambiguationRule[]): void {
    for (const rule of rules) {
      this.disambiguationRulesMap.set(
        rule.detectedPattern.toLowerCase(),
        rule.contextKeywords,
      );

      // Add to plant dictionary with high priority
      if (rule.resolvedPlant) {
        this.addPlantDictionaryEntry(rule.detectedPattern.toLowerCase(), {
          term: rule.detectedPattern.toLowerCase(),
          source: "disambiguation_rule",
          confidence: rule.confidence ?? 0.90,
          latinName: rule.resolvedPlant.latinName,
          genus: rule.resolvedPlant.genus ?? undefined,
          species: rule.resolvedPlant.species ?? undefined,
          cultivar: rule.resolvedPlant.variety ?? undefined,
          priority: "high",
        });
      }
    }
  }

  /**
   * Load product catalog keywords from provided data.
   */
  private loadProductCatalogKeywords(products: ProductCatalogEntry[]): void {
    for (const product of products) {
      if (product.productTitle) {
        // Simple keyword extraction from product title
        // (replaces parseBotanicalProductName dependency)
        const keywords = this.extractBotanicalKeywords(product.productTitle);
        for (const kw of keywords) {
          this.productKeywords.add(kw.toLowerCase());
        }
      }

      if (product.variety) {
        this.productKeywords.add(product.variety.toLowerCase());
      }

      if (product.brand) {
        this.productKeywords.add(product.brand.toLowerCase());
      }
    }
  }

  /**
   * Load market trends from recent product data.
   */
  private loadMarketTrends(recentProducts: ProductCatalogEntry[]): void {
    const varietyFrequency = new Map<string, number>();

    for (const product of recentProducts) {
      if (product.variety) {
        const variety = product.variety.toLowerCase();
        varietyFrequency.set(variety, (varietyFrequency.get(variety) ?? 0) + 1);
      }

      if (product.productTitle) {
        // Extract cultivar names from product titles
        const keywords = this.extractBotanicalKeywords(product.productTitle);
        for (const kw of keywords) {
          varietyFrequency.set(kw, (varietyFrequency.get(kw) ?? 0) + 1);
        }
      }
    }

    // "Trending" = appears 3+ times in recent products
    for (const [variety, count] of varietyFrequency.entries()) {
      if (count >= 3) {
        this.marketTrends.add(variety);
      }
    }
  }

  // ==========================================================================
  // ENTITY HINT EXTRACTION
  // ==========================================================================

  /**
   * Quick scan to identify potential plant mentions.
   */
  private extractEntityHints(transcript: string): EntityHint[] {
    const hints: EntityHint[] = [];
    const lowerTranscript = transcript.toLowerCase();

    // Check against plant dictionary
    for (const [term, hint] of this.plantDictionary.entries()) {
      if (lowerTranscript.includes(term)) {
        hints.push(hint);
      }
    }

    // Check for genus names
    for (const genus of this.genusKeywords) {
      if (lowerTranscript.includes(genus)) {
        const existingHint = hints.find(
          (h) => h.genus?.toLowerCase() === genus,
        );
        if (!existingHint) {
          hints.push({
            term: genus,
            source: "plant_dictionary",
            confidence: 0.85,
            genus,
            priority: "high",
          });
        }
      }
    }

    // Check for trending cultivars
    for (const trend of this.marketTrends) {
      if (lowerTranscript.includes(trend)) {
        hints.push({
          term: trend,
          source: "market_trend",
          confidence: 0.75,
          cultivar: trend,
          priority: "medium",
        });
      }
    }

    // Deduplicate and sort by priority
    const uniqueHints = Array.from(
      new Map(hints.map((h) => [h.term, h])).values(),
    );

    return uniqueHints.sort((a, b) => {
      const priorityScore = { high: 3, medium: 2, low: 1 };
      return priorityScore[b.priority] - priorityScore[a.priority];
    });
  }

  /**
   * Build adaptive keyword list based on entity hints.
   */
  private buildAdaptiveKeywordList(hints: EntityHint[]): string[] {
    const adaptiveKeywords = new Set<string>();

    // Add all high-priority hints
    for (const hint of hints) {
      if (hint.priority === "high") {
        adaptiveKeywords.add(hint.term);
        if (hint.genus) adaptiveKeywords.add(hint.genus.toLowerCase());
        if (hint.species) adaptiveKeywords.add(hint.species.toLowerCase());
        if (hint.cultivar) adaptiveKeywords.add(hint.cultivar.toLowerCase());
      }
    }

    // Add medium-priority hints if we have room
    for (const hint of hints) {
      if (hint.priority === "medium" && adaptiveKeywords.size < 100) {
        adaptiveKeywords.add(hint.term);
      }
    }

    // Add disambiguation context keywords
    for (const hint of hints) {
      if (this.disambiguationRulesMap.has(hint.term)) {
        const contextKeywords = this.disambiguationRulesMap.get(hint.term)!;
        for (const kw of contextKeywords) {
          adaptiveKeywords.add(kw.toLowerCase());
        }
      }
    }

    return Array.from(adaptiveKeywords);
  }

  /**
   * Validate entity mentions against knowledge sources.
   */
  private validateEntityMentions(
    result: PreprocessingResult,
    hints: EntityHint[],
  ): void {
    const processedLower = result.processedText.toLowerCase();
    const missingHighPriority = hints
      .filter((h) => h.priority === "high")
      .filter((h) => !processedLower.includes(h.term));

    if (missingHighPriority.length > 0 && process.env.LOG_PREPROCESSING_STATS === "true") {
      const log = this.logger ?? defaultLogger;
      log.warn("High-priority entities removed during preprocessing", {
        removedTerms: missingHighPriority.map((h) => h.term),
      });
    }
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private addPlantDictionaryEntry(key: string, hint: EntityHint): void {
    const existing = this.plantDictionary.get(key);
    if (
      !existing ||
      this.priorityScore(hint.priority) > this.priorityScore(existing.priority)
    ) {
      this.plantDictionary.set(key, hint);
    }
  }

  private priorityScore(priority: "high" | "medium" | "low"): number {
    return { high: 3, medium: 2, low: 1 }[priority];
  }

  private calculatePriority(
    usageCount: number,
    ambiguityScore?: number | null,
  ): "high" | "medium" | "low" {
    const ambiguity = ambiguityScore ?? 0;
    if (usageCount > 10 && ambiguity < 0.3) return "high";
    if (usageCount > 3 || ambiguity < 0.5) return "medium";
    return "low";
  }

  /**
   * Simple botanical keyword extraction from product titles.
   * Replaces the `parseBotanicalProductName` dependency.
   * Extracts meaningful words, filtering out common noise.
   */
  private extractBotanicalKeywords(title: string): string[] {
    const noise = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
      "with", "from", "by", "of", "cm", "mm", "l", "litre", "liter", "inch",
      "pack", "set", "x", "uk", "eu", "us",
    ]);

    return title
      .toLowerCase()
      .replace(/[^\w\s'-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !noise.has(w));
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick preprocessing with knowledge enhancement.
 * Pass knowledge data to initialize the preprocessor.
 */
export async function preprocessWithKnowledge(
  transcript: string,
  knowledgeData: KnowledgeData = {},
  videoId?: string,
): Promise<KnowledgeEnhancedResult> {
  const preprocessor = new KnowledgeEnhancedPreprocessor();
  await preprocessor.initialize(knowledgeData);
  return preprocessor.preprocessWithKnowledge(transcript, videoId);
}

/**
 * Batch preprocessing with knowledge enhancement.
 */
export async function preprocessBatchWithKnowledge(
  transcripts: Array<{ id: string; text: string }>,
  knowledgeData: KnowledgeData = {},
): Promise<Map<string, KnowledgeEnhancedResult>> {
  const preprocessor = new KnowledgeEnhancedPreprocessor();
  await preprocessor.initialize(knowledgeData);
  const results = new Map<string, KnowledgeEnhancedResult>();

  for (const { id, text } of transcripts) {
    const result = await preprocessor.preprocessWithKnowledge(text, id);
    results.set(id, result);
  }

  return results;
}
