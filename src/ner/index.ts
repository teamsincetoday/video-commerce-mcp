/**
 * NER Pipeline — Barrel export.
 *
 * The NER pipeline handles:
 * 1. Enhanced entity extraction with disambiguation and variety hints
 * 2. Entity resolution against a canonical plant dictionary (fuzzy + exact)
 * 3. Context-aware entity disambiguation (with optional AI fallback)
 * 4. Multi-factor confidence calibration
 * 5. Variety/cultivar hint generation for improved extraction
 * 6. In-memory plant dictionary (loaded from JSON)
 */

// Enhanced NER — main extraction and enrichment pipeline
export {
  enhanceExtractedEntities,
  type ExtractEntitiesOptions,
  type ExtractEntitiesInput,
  type ExtractionMetrics,
  type EnhancedExtractionResult,
} from "./enhanced-ner.js";

// Entity resolution — canonical dictionary with fuzzy matching
export {
  resolveEntityAdvanced,
  batchResolveEntities,
  suggestRelatedEntities,
  fuzzyMatch,
  levenshteinDistance,
  jaroWinklerSimilarity,
  jaroSimilarity,
  type ResolveOptions,
} from "./entity-resolution.js";

// Entity disambiguation — context-aware resolution of ambiguous names
export {
  disambiguateEntity,
  batchDisambiguate,
  detectAmbiguousEntities,
  type DisambiguationOptions,
} from "./entity-disambiguation.js";

// Confidence calibration — multi-factor scoring
export {
  calibrateConfidence,
  assessContextQuality,
  calculateSpecificityLevel,
  batchCalibrateConfidence,
} from "./confidence-calibration.js";

// Variety hint provider — cultivar hints for improved NER
export {
  getVarietyHintsForGenus,
  getVarietyHintsForGenera,
  formatVarietyHintsForPrompt,
  extractPotentialGeneraFromText,
  clearVarietyHintsCache,
} from "./variety-hint-provider.js";

// Plant dictionary — in-memory implementation
export {
  createPlantDictionary,
  createPlantDictionaryFromFile,
  createEmptyDictionary,
} from "./plant-dictionary.js";

// Re-export shared types for convenience
export type {
  Entity,
  EnhancedEntity,
  CanonicalEntity,
  ResolutionResult,
  EntityDisambiguationContext,
  DisambiguationCandidate,
  EntityDisambiguationResult,
  CalibrationFactors,
  CalibratedResult,
  VarietyHint,
  PlantDictionary,
  PlantEntry,
  AIClient,
} from "../types.js";
