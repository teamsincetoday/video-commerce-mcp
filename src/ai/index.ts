/**
 * AI Module — Barrel export.
 *
 * The AI module handles:
 * 1. AI Orchestrator — unified GPT prompt that extracts 6 outputs in one call
 * 2. API Budget Manager — per-request cost caps and rate limiting
 * 3. NER Prompt Evolution — prompt versioning, A/B testing, auto-tuning
 */

// AI Orchestrator — core of the MCP pipeline
export {
  AIOrchestrator,
  createAIOrchestrator,
  type VideoProcessingTask,
  type VideoProcessingResult,
  type AffiliateProcessingTask,
  type AffiliateProcessingResult,
  type OrchestratorStats,
  type AIOrchestratorOptions,
} from "./ai-orchestrator.js";

// API Budget Manager — cost control and rate limiting
export {
  APIBudgetManager,
  createBudgetManager,
  type BudgetCheckResult,
  type APIUsageStats,
  type APIBudgetConfig,
  type RateLimitState,
  type UsagePersistence,
} from "./api-budget-manager.js";

// NER Prompt Evolution — prompt versioning and auto-tuning
export {
  getDefaultPrompt,
  getActivePromptVersion,
  createPromptVersion,
  analyzePromptPerformance,
  suggestPromptImprovements,
  comparePromptVersions,
  calculateQualityScore,
  type PromptConfig,
  type PromptVersionRecord,
  type PromptMetric,
  type EntityCorrection,
  type PromptComparisonResult,
  type PromptStats,
  type AutoTuneResult,
  type PromptImprovementSuggestion,
} from "./ner-prompt-evolution.js";
