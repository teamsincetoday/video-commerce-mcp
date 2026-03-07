/**
 * Intelligence Module -- Barrel export.
 *
 * The intelligence module provides six analysis layers:
 *
 * 1. Audience Taxonomy -- 7 intent archetypes with commercial value scoring
 * 2. Skill Extraction -- AI-powered skill graph from transcripts
 * 3. Objective Extraction -- Learning objectives from teaching sections
 * 4. Seasonal Context -- Zero-cost regex season/climate detection
 * 5. Editorial Quality -- Content quality scoring on 6 dimensions
 * 6. Category Potential -- Commercial and learning potential scoring
 */

// Audience Taxonomy -- 7 intent archetypes
export {
  GARDENING_INTENT_TAXONOMY,
  STARTUP_INTENT_TAXONOMY,
  GENERIC_INTENT_TAXONOMY,
  getTaxonomyForVertical,
  detectIntentInSegment,
  analyzeTranscriptIntent,
  getHighValueSegments,
  exportIntentAnalysis,
  type AudienceIntent,
  type IntentDetectionResult,
  type TranscriptIntentAnalysis,
} from "./audience-taxonomy.js";

// Skill Extraction -- skill graph from transcripts
export {
  extractVideoSkills,
  type SkillAnalysis,
  type ActionIntentSignal,
  type SkillExtractionOptions,
} from "./skill-extraction.js";

// Objective Extraction -- learning objectives from teaching sections
export {
  extractObjectivesWithAI,
  batchExtractObjectives,
  selectTopSectionsForAI,
  type AIObjectiveResult,
  type ObjectiveExtractionOptions,
} from "./objective-extraction.js";

// Seasonal Context -- zero-cost regex detection
export {
  extractSeasonalContext,
  getSeasonSummary,
  getClimateSummary,
  isRelevantForSeason,
  type SeasonalContext,
} from "./seasonal-context.js";

// Editorial Quality -- content quality scoring
export {
  assessEditorialQuality,
  determineEditorialTier,
  getDefaultScores,
  type EditorialQualityScore,
  type VideoAssessmentInput,
  type EditorialAssessmentOptions,
} from "./editorial-quality.js";

// Category Potential -- commercial potential scoring
export {
  scoreCategoryPotential,
  batchScoreCandidates,
  getTopPriorityCandidates,
  type PotentialScore,
  type CategoryCandidate,
  type ExistingCategory,
} from "./category-potential.js";
