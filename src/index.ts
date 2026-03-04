/**
 * Video Commerce Intelligence MCP
 *
 * Main export barrel for the package.
 * Re-exports the server factory and key types.
 */

export { createServer, startStdioServer, startSseServer } from "./server.js";

// Transcript pipeline — fetching, preprocessing, multi-category detection
export * from "./transcript/index.js";

// NER pipeline — entity extraction, resolution, disambiguation, calibration
export * from "./ner/index.js";

// AI module — orchestrator, budget manager, prompt evolution
export * from "./ai/index.js";

// Intelligence module — audience intent, skills, objectives, seasonal, editorial, category potential
export * from "./intelligence/index.js";

// Market intelligence — convergence scoring, affinity, discovery, calendar, affiliates, channel vetting, lifecycle
export * from "./market-intelligence/index.js";

// Verticals — vertical config system, gardening default, dictionary schema, registry
export * from "./verticals/index.js";

// Pipeline orchestrator — central coordinator for all extraction stages
export {
  PipelineOrchestrator,
  createPipelineOrchestrator,
} from "./pipeline-orchestrator.js";
export type {
  PipelineOptions,
  AnalysisRequest,
  AnalysisDimension,
  PipelineResult,
  PipelineMeta,
  PipelineEntity,
  PipelineCommerceItem,
  PipelineMonetization,
  PipelineAudience,
  PipelineQuality,
  PipelineSkills,
  PipelineMarket,
} from "./pipeline-orchestrator.js";

// Response formatter — shape pipeline output into MCP response schemas (Layer 1)
export {
  formatAnalyzeVideoResponse,
  formatCommercialEntitiesResponse,
  formatMonetizationResponse,
  formatAudienceInsightsResponse,
  formatContentGapsResponse,
  formatBatchAnalyzeResponse,
} from "./response-formatter.js";
export type {
  AnalysisResult,
  AnalysisEntity,
  ContentGap,
  ResponseEntity,
  AnalyzeVideoResponse,
  CommercialEntitiesResponse,
  MonetizationResponse,
  AudienceInsightsResponse,
  ContentGapsResponse,
  BatchAnalyzeResponse,
} from "./response-formatter.js";

// Market intelligence response formatter — shape market intelligence output into MCP response schemas (Layer 2)
export {
  formatOpportunitiesResponse,
  formatAffiliateProgramsResponse,
  formatChannelAuthorityResponse,
  formatCategoryAffinityResponse,
  formatCategoryLifecycleResponse,
  formatSeasonalCalendarResponse,
} from "./market-intelligence-formatter.js";
export type {
  OpportunityData,
  AffiliateProgramData,
  ChannelAuthorityData,
  CategoryAffinityData,
  CategoryLifecycleData,
  SeasonalCalendarData,
  OpportunitiesResponse,
  AffiliateProgramsResponse,
  ChannelAuthorityResponse,
  CategoryAffinityResponse,
  CategoryLifecycleResponse,
  SeasonalCalendarResponse,
} from "./market-intelligence-formatter.js";

// Analysis cache — SQLite-backed cache for video analysis results
export {
  AnalysisCache,
  createAnalysisCache,
} from "./analysis-cache.js";
export type {
  CachedAnalysis,
  CacheStats,
  AnalysisCacheOptions,
  CacheSetOptions,
} from "./analysis-cache.js";

// x402 payment middleware — micropayment verification, free tier, API key fallback
export {
  PaymentMiddleware,
  createPaymentMiddleware,
  DEFAULT_TOOL_PRICING,
} from "./x402-middleware.js";
export type {
  PaymentConfig,
  RequestContext,
  AuthResult,
  PaymentRequiredInfo,
  PaymentReceipt,
} from "./x402-middleware.js";

// Usage metering — usage tracking, rate limiting, and revenue reporting
export {
  UsageMetering,
  createUsageMetering,
} from "./usage-metering.js";
export type {
  MeteringOptions,
  RateLimits,
  UsageEvent,
  RateLimitResult,
  AgentStats,
  ToolStats,
  OverviewStats,
  RevenueStats,
} from "./usage-metering.js";

// Shared types
export type {
  CommerceItemCategory,
  TranscriptSegment,
  ParsedTranscript,
  PreprocessingResult,
  StageResult,
  PreprocessingMetadata,
  PreprocessingOptions,
  KnowledgeEnhancedResult,
  KnowledgeSourcesUsed,
  EntityHint,
  PlantEntry,
  DisambiguationRule,
  CommerceItemEntry,
  AffiliateOfferEntry,
  ProductCatalogEntry,
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
  AIClient,
  Logger,
} from "./types.js";

export { defaultLogger } from "./types.js";
