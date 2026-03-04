/**
 * Shared types for the Video Commerce Intelligence MCP package.
 *
 * These types replace Prisma-generated types and monolith dependencies,
 * keeping the package fully standalone.
 */

// ============================================================================
// COMMERCE CATEGORIES
// ============================================================================

/**
 * Commerce item categories (replaces @prisma/client CommerceItemCategory).
 * 9 categories covering all shoppable entity types in video content.
 */
export type CommerceItemCategory =
  | "PLANT"
  | "TOOL"
  | "MATERIAL"
  | "STRUCTURE"
  | "SEED"
  | "BOOK"
  | "COURSE"
  | "EVENT"
  | "SERVICE"
  | "OTHER";

// ============================================================================
// TRANSCRIPT TYPES
// ============================================================================

export interface TranscriptSegment {
  timestamp: string;
  start: number; // seconds
  duration: number;
  text: string;
}

export interface ParsedTranscript {
  videoId: string;
  segments: TranscriptSegment[];
  fullText: string;
}

// ============================================================================
// PREPROCESSING TYPES
// ============================================================================

export interface PreprocessingResult {
  originalText: string;
  processedText: string;
  originalLength: number;
  processedLength: number;
  reductionPercentage: number;
  stages: StageResult[];
  metadata: PreprocessingMetadata;
}

export interface StageResult {
  stage: number;
  name: string;
  inputLength: number;
  outputLength: number;
  reduction: number;
  reductionPercentage: number;
  duration: number; // milliseconds
  metadata?: Record<string, unknown>;
}

export interface PreprocessingMetadata {
  fillerWordsRemoved: number;
  sponsorSegmentsRemoved: number;
  repetitionsRemoved: number;
  irrelevantSegmentsRemoved: number;
  botanicalTermsFound: string[];
  keywordDensity: number;
  hasHighQualityContent: boolean;
  estimatedTokens: number;
  processingTime: number;
}

export interface PreprocessingOptions {
  targetReduction?: number; // 0-1, default 0.75 (75%)
  maxLength?: number; // characters, default 8000
  minKeywordDensity?: number; // 0-1, default 0.02 (2%)
  contextWindowSize?: number; // characters, default 200
  enableAggressiveFiltering?: boolean; // default true
}

// ============================================================================
// KNOWLEDGE-ENHANCED TYPES
// ============================================================================

export interface KnowledgeEnhancedResult extends PreprocessingResult {
  knowledgeSources: KnowledgeSourcesUsed;
  entityHints: EntityHint[];
  adaptiveKeywords: string[];
}

export interface KnowledgeSourcesUsed {
  plantDictionary: boolean;
  disambiguationRules: boolean;
  productCatalog: boolean;
  authoritativeSources: boolean;
  marketTrends: boolean;
}

export interface EntityHint {
  term: string;
  source:
    | "plant_dictionary"
    | "product_catalog"
    | "disambiguation_rule"
    | "market_trend";
  confidence: number;
  latinName?: string;
  genus?: string;
  species?: string;
  cultivar?: string;
  tradeNames?: string[];
  priority: "high" | "medium" | "low";
}

// ============================================================================
// PLANT DICTIONARY TYPES (replaces Prisma Plant model)
// ============================================================================

export interface PlantEntry {
  latinName: string;
  commonNames: string[];
  synonyms: string[];
  genus: string | null;
  species: string | null;
  variety: string | null;
  tradeNames: string[];
  taxonomyLevel: string | null;
  usageCount: number;
  ambiguityScore: number | null;
}

// ============================================================================
// DISAMBIGUATION TYPES (replaces Prisma DisambiguationRule model)
// ============================================================================

export interface DisambiguationRule {
  detectedPattern: string;
  resolvedPlant: {
    latinName: string;
    commonNames: string[];
    genus: string | null;
    species: string | null;
    variety: string | null;
  } | null;
  contextKeywords: string[];
  confidence: number;
}

// ============================================================================
// COMMERCE DATA TYPES (replaces Prisma VideoCommerceItem, Affiliate models)
// ============================================================================

export interface CommerceItemEntry {
  name: string;
  category: CommerceItemCategory;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface AffiliateOfferEntry {
  entityType: string;
  productTitle: string;
  confidence: number;
}

export interface ProductCatalogEntry {
  productTitle: string;
  variety: string | null;
  brand: string | null;
}

// ============================================================================
// NER TYPES (Named Entity Recognition)
// ============================================================================

/**
 * A raw extracted entity from the NER pipeline.
 * Flexible metadata allows domain-agnostic entity extraction.
 */
export interface Entity {
  entity: string; // Primary identifier (e.g., Latin name, product name)
  metadata: Record<string, unknown>; // Flexible metadata (latinName, quantity, etc.)
  timestamp: string;
  context: string;
  confidence: number;
}

/**
 * An enhanced entity with disambiguation and enrichment data.
 * Extended from the raw Entity with additional resolution information.
 */
export interface EnhancedEntity extends Entity {
  plantId?: string;
  taxonomyLevel?: string;
  disambiguated: boolean;
  disambiguationMethod?: string;
  targetAudience?: string;
  cognitiveComplexity?: number;
  practicalComplexity?: number;
  emotionalComplexity?: number;
}

// ============================================================================
// ENTITY RESOLUTION TYPES
// ============================================================================

/**
 * A canonical entity after resolution against the dictionary.
 */
export interface CanonicalEntity {
  id: string;
  canonicalName: string;
  latinName: string;
  commonNames: string[];
  synonyms: string[];
  cultivars: string[];
  misspellings: string[];
  category: string;
  confidence: number;
}

/**
 * Result of resolving an entity name against the canonical dictionary.
 */
export interface ResolutionResult {
  entity: CanonicalEntity | null;
  matchType:
    | "exact"
    | "fuzzy"
    | "synonym"
    | "cultivar"
    | "misspelling"
    | "none";
  confidence: number;
  alternatives: CanonicalEntity[];
}

// ============================================================================
// ENTITY DISAMBIGUATION TYPES
// ============================================================================

/**
 * Context for disambiguating an ambiguous entity name.
 */
export interface EntityDisambiguationContext {
  entityName: string;
  context: string;
  timestamp: string;
  videoCategory?: string;
  channelName?: string;
  videoTitle?: string;
  nearbyEntities: string[];
  vertical: string; // 'gardening', 'cooking', etc.
}

/**
 * A candidate entity for disambiguation.
 */
export interface DisambiguationCandidate {
  id: string;
  canonicalName: string;
  latinName: string;
  commonNames: string[];
  category: string;
  matchScore: number;
  reason: string;
}

/**
 * Result of entity disambiguation.
 */
export interface EntityDisambiguationResult {
  originalName: string;
  resolved: boolean;
  selectedCandidate: DisambiguationCandidate | null;
  alternatives: DisambiguationCandidate[];
  confidence: number;
  reasoning: string;
}

// ============================================================================
// CONFIDENCE CALIBRATION TYPES
// ============================================================================

/**
 * Factors used to calibrate confidence scores.
 */
export interface CalibrationFactors {
  patternMatch: boolean;
  patternType?: string;
  existsInDictionary: boolean;
  dictionaryConfidence?: number;
  multipleMentions: boolean;
  mentionCount: number;
  totalDuration: number;
  contextQuality: number;
  contextLength: number;
  visualConfirmation?: boolean;
  audioQuality?: number;
  hasVariety: boolean;
  specificityLevel: number;
  mentionedWithKnownEntities: boolean;
  coOccurrenceCount: number;
  captionType?: "auto" | "manual" | "none";
  tagMatch?: boolean;
  topicMatch?: boolean;
  descriptionMention?: boolean;
  verticalConfidence?: number;
}

/**
 * Result of confidence calibration.
 */
export interface CalibratedResult {
  originalConfidence: number;
  calibratedConfidence: number;
  adjustmentFactor: number;
  confidenceBreakdown: {
    baseScore: number;
    patternBonus: number;
    dictionaryBonus: number;
    temporalBonus: number;
    contextBonus: number;
    varietyBonus: number;
    coOccurrenceBonus: number;
    visualBonus: number;
    metadataBonus: number;
  };
  reliability: "high" | "medium" | "low";
  warnings: string[];
}

// ============================================================================
// VARIETY HINT TYPES
// ============================================================================

/**
 * A variety/cultivar hint for improving NER accuracy.
 */
export interface VarietyHint {
  genus: string;
  species?: string;
  variety: string;
  source: "plant_dictionary" | "enrichment_cache" | "emerging_cultivar";
  confidence: number;
  usageCount?: number;
}

// ============================================================================
// PLANT DICTIONARY INTERFACE
// ============================================================================

/**
 * Interface for plant dictionary lookups.
 * Abstracts the data source (JSON file, database, API).
 */
export interface PlantDictionary {
  findByName(name: string): PlantEntry | undefined;
  findByLatinName(latinName: string): PlantEntry | undefined;
  findByCommonName(commonName: string): PlantEntry[];
  findByGenus(genus: string): PlantEntry[];
  search(query: string): PlantEntry[];
  getAll(): PlantEntry[];
  size(): number;
}

// ============================================================================
// AI CLIENT INTERFACE (for NER disambiguation)
// ============================================================================

/**
 * Minimal AI client interface for NER disambiguation.
 * Callers can provide their own OpenAI client wrapper.
 */
export interface AIClient {
  complete(params: {
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ content: string }>;
}

// ============================================================================
// LOGGER INTERFACE
// ============================================================================

/**
 * Simple logger interface. Callers can provide their own implementation
 * or use the default console-based logger.
 */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
}

/**
 * Default console-based logger.
 */
export const defaultLogger: Logger = {
  info(message: string, meta?: Record<string, unknown>) {
    if (process.env.LOG_LEVEL === "debug" || process.env.LOG_PREPROCESSING_STATS === "true") {
      console.info(`[info] ${message}`, meta ? JSON.stringify(meta) : "");
    }
  },
  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(`[warn] ${message}`, meta ? JSON.stringify(meta) : "");
  },
  error(message: string, error?: Error, meta?: Record<string, unknown>) {
    console.error(`[error] ${message}`, error?.message ?? "", meta ? JSON.stringify(meta) : "");
  },
};
