/**
 * Market Intelligence Module
 *
 * Layer 2 of the Video Commerce Intelligence MCP.
 * Cross-video, autonomous market intelligence capabilities:
 *
 * - Convergence Detection: Three-forces scoring (demand x commission x authority)
 * - Affinity Calculator: Cross-category relationship mapping
 * - Autonomous Discovery: Pattern detection and candidate validation
 * - Commerce Calendar: Seasonal events with demand multipliers
 * - Awin Scanner: Affiliate program discovery
 * - Hybrid Filter: Cost-optimized relevance filtering
 * - Channel Vetting: 5-dimension channel authority scoring
 * - AI Composite Evaluator: AI-based authority evaluation
 * - Internal Intelligence: Internal data aggregation for three forces
 * - Category Lifecycle: State machine for category promotion/retirement
 */

// Convergence Detection
export {
  calculateConvergenceScore,
  analyzeCompetition,
  analyzeTrendDirection,
  generateOpportunityAnalysis,
  calculateConvergenceConfidence,
  generateReasoning,
  detectConvergence,
  type ConvergenceSignals,
  type ConvergenceInput,
} from "./convergence-detector.js";

// Affinity Calculator
export {
  calculateKeywordOverlap,
  determineRelationshipType,
  calculateAffinity,
  calculateAllAffinities,
  type AffinityResult,
  type CategoryAffinityInput,
  type OverlapData,
} from "./affinity-calculator.js";

// Autonomous Discovery
export {
  AutonomousCategoryDiscovery,
  type DiscoveryConfig,
  type PatternCluster,
  type DiscoveryResult,
  type UncategorizedProduct,
  type CandidateCategory,
  type ThreeForcesScores,
} from "./autonomous-discovery.js";

// Commerce Calendar
export {
  createSlug,
  computePromotionStatus,
  getCurrentSeason,
  inferCategoriesFromEvent,
  getEventBadgeColor,
  getSeasonalPlantPromotions,
  getDefaultGardeningPromotions,
  buildPromotionFromTemplate,
  type PromotionType,
  type PromotionRegion,
  type PromotionData,
  type CreatePromotionInput,
  type SeasonalPlantPromotion,
  type EthnobotanicalEvent,
  type DefaultPromotionTemplate,
} from "./commerce-calendar.js";

// Awin Scanner
export {
  AwinProgramScanner,
  type AwinAdvertiser,
  type DiscoveredProgram,
  type ProgramVerticals,
  type RelevanceAnalysis,
  type LocationData,
  type AwinScannerOptions,
} from "./awin-scanner.js";

// Hybrid Filter
export {
  HybridRelevanceFilter,
  createHybridFilter,
  type HybridFilterConfig,
  type KeywordRelevanceResult,
  type HybridFilterStats,
} from "./hybrid-filter.js";

// Channel Vetting
export {
  evaluateChannel,
  calculateCompositeScore,
  calculateConfidence,
  determineDecision,
  needsAIEvaluation,
  applyAIAdjustments,
  estimateAICost,
  CRITERIA_METADATA,
  CONFIDENCE_THRESHOLD,
  HIGH_SCORE_THRESHOLD,
  LOW_SCORE_THRESHOLD,
  type CriterionId,
  type CriterionResult,
  type CriterionMetadata,
  type ChannelForVetting,
  type AIEvaluationResponse,
  type VettingResult,
  type BatchVettingResult,
  type CriterionEvaluator,
} from "./channel-vetting.js";

// AI Composite Evaluator
export {
  buildEvaluationPrompt,
  evaluateWithAI,
  createAIEvaluator,
  type AIEvaluationRequest,
} from "./ai-composite-evaluator.js";

// Internal Intelligence
export {
  calculateInternalDemand,
  calculateInternalCommission,
  calculateInternalAuthority,
  calculateInternalConvergence,
  type InternalDemandSignals,
  type InternalCommissionSignals,
  type InternalAuthoritySignals,
  type DemandData,
  type CommissionData,
  type AuthorityData,
} from "./internal-intelligence.js";

// Category Lifecycle
export {
  CategoryLifecycleManager,
  type LifecycleStage,
  type PromotionConfig,
  type CandidateForPromotion,
  type CategoryForRetirement,
  type PromotionResult,
  type RetirementResult,
} from "./category-lifecycle.js";
