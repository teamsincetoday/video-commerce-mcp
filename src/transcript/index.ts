/**
 * Transcript Pipeline — Barrel export.
 *
 * The transcript pipeline handles:
 * 1. Fetching YouTube transcripts (multi-strategy: npm package + API fallback)
 * 2. Cost-optimized preprocessing (70-90% token reduction in 6 stages)
 * 3. Knowledge-enhanced filtering (plant dictionary, disambiguation rules)
 * 4. Multi-category commerce detection (9 categories, 500+ keywords)
 */

// Transcript parser — fetching and parsing YouTube transcripts
export {
  parseTranscript,
  getVideoMetadata,
  getCaptionType,
  extractYouTubeId,
  formatSeconds,
  parseDuration,
  type TranscriptFetchOptions,
  type VideoMetadata,
} from "./transcript-parser.js";

// Advanced preprocessor — 6-stage token reduction pipeline
export {
  AdvancedTranscriptPreprocessor,
  preprocessTranscript,
  preprocessTranscriptWithOptions,
  hasSufficientBotanicalContent,
  BOTANICAL_KEYWORDS,
  FILLER_WORDS,
  SPONSOR_PATTERNS,
  INTRO_OUTRO_PATTERNS,
} from "./advanced-preprocessor.js";

// Knowledge-enhanced preprocessor — plant dictionary + disambiguation
export {
  KnowledgeEnhancedPreprocessor,
  preprocessWithKnowledge,
  preprocessBatchWithKnowledge,
  type KnowledgeData,
} from "./knowledge-preprocessor.js";

// Multi-category preprocessor — 9 commerce categories, 500+ keywords
export {
  MultiCategoryPreprocessor,
  preprocessWithAllCategories,
  COMMERCE_KEYWORDS,
  ALL_COMMERCE_KEYWORDS,
  type MultiCategoryData,
} from "./multi-category-preprocessor.js";

// Re-export shared types for convenience
export type {
  TranscriptSegment,
  ParsedTranscript,
  PreprocessingResult,
  StageResult,
  PreprocessingMetadata,
  PreprocessingOptions,
  KnowledgeEnhancedResult,
  KnowledgeSourcesUsed,
  EntityHint,
  CommerceItemCategory,
} from "../types.js";
