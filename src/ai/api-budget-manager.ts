/**
 * API Budget Manager
 *
 * Centralized rate limiting and budget tracking for external API usage.
 * Ensures per-request cost caps are enforced so analysis stays cheap.
 *
 * Ported from monolith lib/services/api-budget-manager.ts.
 * Standalone: no Prisma, no monolith dependencies. In-memory tracking
 * with optional persistence callbacks.
 *
 * Key features:
 * - Token bucket algorithm for rate limiting
 * - Daily/monthly budget tracking (in-memory, reset on restart)
 * - Cost estimation before API calls
 * - Emergency stop when budget exceeded
 * - Alert at configurable threshold (default 80%)
 * - Per-service usage tracking
 *
 * Usage:
 * ```typescript
 * import { APIBudgetManager, createBudgetManager } from 'video-commerce-mcp';
 *
 * const manager = createBudgetManager({
 *   openaiDailyBudget: 0.50,
 *   openaiPerRequestLimit: 0.005,
 * });
 *
 * const check = manager.canUseOpenAI(0.003);
 * if (check.allowed) {
 *   // ... make API call ...
 *   manager.trackOpenAIUsage(0.003, 1500, 'gpt-4o-mini');
 * }
 * ```
 */

import type { Logger } from "../types.js";
import { defaultLogger } from "../types.js";

// ============================================================================
// TYPES
// ============================================================================

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage: APIUsageStats;
  waitTimeMs?: number;
}

export interface APIUsageStats {
  service: string;
  requestsToday: number;
  requestsThisMonth: number;
  costToday: number;
  costThisMonth: number;
  lastRequestTime?: Date;
  budgetRemaining: number;
  quotaRemaining?: number;
}

export interface APIBudgetConfig {
  // OpenAI
  openaiDailyBudget: number; // USD
  openaiMonthlyBudget: number; // USD
  openaiPerRequestLimit: number; // USD
  openaiAlertThreshold: number; // 0-1

  // Generic external API rate limits
  externalAPIDailyQuota: number; // requests
  externalAPIRateLimit: number; // requests per second

  // Emergency stop
  emergencyStopEnabled: boolean;
}

export interface RateLimitState {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number; // tokens per millisecond
}

/** Callback for persisting usage data externally. */
export interface UsagePersistence {
  onUsageTracked?: (
    service: string,
    cost: number,
    tokens: number,
    model: string
  ) => void | Promise<void>;
  onBudgetAlert?: (service: string, percentageUsed: number) => void | Promise<void>;
  onEmergencyStop?: (service: string, reason: string) => void | Promise<void>;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: APIBudgetConfig = {
  // OpenAI defaults tuned for MCP usage (< $0.005 per analysis)
  openaiDailyBudget: parseFloat(process.env.AI_DAILY_BUDGET ?? "0.50"),
  openaiMonthlyBudget: parseFloat(process.env.AI_MONTHLY_BUDGET ?? "10.00"),
  openaiPerRequestLimit: parseFloat(process.env.AI_PER_VIDEO_LIMIT ?? "0.01"),
  openaiAlertThreshold: parseFloat(process.env.AI_ALERT_THRESHOLD ?? "0.80"),

  // Generic external API defaults
  externalAPIDailyQuota: 10000,
  externalAPIRateLimit: 5, // 5 req/sec

  // Emergency stop
  emergencyStopEnabled: process.env.AI_EMERGENCY_STOP !== "false",
};

// ============================================================================
// IN-MEMORY USAGE TRACKER
// ============================================================================

interface UsageCounters {
  requestsToday: number;
  requestsThisMonth: number;
  costToday: number;
  costThisMonth: number;
  lastRequestTime?: Date;
  dayStart: number; // timestamp of day start
  monthStart: number; // timestamp of month start
}

function createUsageCounters(): UsageCounters {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  return {
    requestsToday: 0,
    requestsThisMonth: 0,
    costToday: 0,
    costThisMonth: 0,
    dayStart,
    monthStart,
  };
}

/**
 * Auto-reset counters if the day/month has changed since last check.
 */
function maybeResetCounters(counters: UsageCounters): void {
  const now = new Date();
  const currentDayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).getTime();

  if (currentDayStart > counters.dayStart) {
    counters.requestsToday = 0;
    counters.costToday = 0;
    counters.dayStart = currentDayStart;
  }

  if (currentMonthStart > counters.monthStart) {
    counters.requestsThisMonth = 0;
    counters.costThisMonth = 0;
    counters.monthStart = currentMonthStart;
  }
}

// ============================================================================
// API BUDGET MANAGER CLASS
// ============================================================================

export class APIBudgetManager {
  private config: APIBudgetConfig;
  private logger: Logger;
  private persistence?: UsagePersistence;
  private rateLimitStates: Map<string, RateLimitState> = new Map();
  private usageCounters: Map<string, UsageCounters> = new Map();

  constructor(
    config: Partial<APIBudgetConfig> = {},
    logger?: Logger,
    persistence?: UsagePersistence
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? defaultLogger;
    this.persistence = persistence;
    this.initializeRateLimiters();
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  private initializeRateLimiters(): void {
    // Generic external API rate limiter
    this.rateLimitStates.set("external", {
      tokens: this.config.externalAPIRateLimit,
      lastRefill: Date.now(),
      capacity: this.config.externalAPIRateLimit,
      refillRate: this.config.externalAPIRateLimit / 1000,
    });
  }

  private getCounters(service: string): UsageCounters {
    let counters = this.usageCounters.get(service);
    if (!counters) {
      counters = createUsageCounters();
      this.usageCounters.set(service, counters);
    }
    maybeResetCounters(counters);
    return counters;
  }

  // ==========================================================================
  // OPENAI API BUDGET MANAGEMENT
  // ==========================================================================

  /**
   * Check if OpenAI API call is allowed within budget.
   */
  canUseOpenAI(estimatedCost: number): BudgetCheckResult {
    const counters = this.getCounters("openai");

    const usage: APIUsageStats = {
      service: "openai",
      requestsToday: counters.requestsToday,
      requestsThisMonth: counters.requestsThisMonth,
      costToday: counters.costToday,
      costThisMonth: counters.costThisMonth,
      lastRequestTime: counters.lastRequestTime,
      budgetRemaining: this.config.openaiDailyBudget - counters.costToday,
    };

    // Check per-request limit
    if (estimatedCost > this.config.openaiPerRequestLimit) {
      return {
        allowed: false,
        reason: `Request cost ($${estimatedCost.toFixed(4)}) exceeds per-request limit ($${this.config.openaiPerRequestLimit})`,
        currentUsage: usage,
      };
    }

    // Check daily budget
    if (counters.costToday + estimatedCost > this.config.openaiDailyBudget) {
      return {
        allowed: false,
        reason: `Daily budget exceeded ($${counters.costToday.toFixed(2)}/$${this.config.openaiDailyBudget})`,
        currentUsage: usage,
      };
    }

    // Check monthly budget
    if (
      counters.costThisMonth + estimatedCost >
      this.config.openaiMonthlyBudget
    ) {
      return {
        allowed: false,
        reason: `Monthly budget exceeded ($${counters.costThisMonth.toFixed(2)}/$${this.config.openaiMonthlyBudget})`,
        currentUsage: usage,
      };
    }

    // Check alert threshold
    const dailyPercentage =
      (counters.costToday + estimatedCost) / this.config.openaiDailyBudget;
    if (dailyPercentage >= this.config.openaiAlertThreshold) {
      this.logger.warn("OpenAI budget alert", {
        dailyPercentageUsed: parseFloat((dailyPercentage * 100).toFixed(1)),
      });
      void this.persistence?.onBudgetAlert?.("openai", dailyPercentage);
    }

    return {
      allowed: true,
      currentUsage: usage,
    };
  }

  /**
   * Track OpenAI API usage after a successful call.
   */
  trackOpenAIUsage(cost: number, tokens: number, model: string): void {
    const counters = this.getCounters("openai");
    counters.requestsToday++;
    counters.requestsThisMonth++;
    counters.costToday += cost;
    counters.costThisMonth += cost;
    counters.lastRequestTime = new Date();

    this.logger.info("OpenAI usage tracked", {
      cost: `$${cost.toFixed(4)}`,
      tokens,
      model,
    });

    void this.persistence?.onUsageTracked?.("openai", cost, tokens, model);
  }

  // ==========================================================================
  // GENERIC EXTERNAL API RATE LIMITING
  // ==========================================================================

  /**
   * Check if an external API call is allowed (rate limiting via token bucket).
   */
  canUseExternalAPI(serviceName: string): BudgetCheckResult {
    let state = this.rateLimitStates.get(serviceName);
    if (!state) {
      // Create a new rate limiter for unknown services using default config
      state = {
        tokens: this.config.externalAPIRateLimit,
        lastRefill: Date.now(),
        capacity: this.config.externalAPIRateLimit,
        refillRate: this.config.externalAPIRateLimit / 1000,
      };
      this.rateLimitStates.set(serviceName, state);
    }

    const counters = this.getCounters(serviceName);

    const usage: APIUsageStats = {
      service: serviceName,
      requestsToday: counters.requestsToday,
      requestsThisMonth: counters.requestsThisMonth,
      costToday: counters.costToday,
      costThisMonth: counters.costThisMonth,
      lastRequestTime: counters.lastRequestTime,
      budgetRemaining: this.config.externalAPIDailyQuota - counters.requestsToday,
      quotaRemaining: this.config.externalAPIDailyQuota - counters.requestsToday,
    };

    // Refill tokens based on time elapsed
    const now = Date.now();
    const elapsedMs = now - state.lastRefill;
    const tokensToAdd = elapsedMs * state.refillRate;
    state.tokens = Math.min(state.capacity, state.tokens + tokensToAdd);
    state.lastRefill = now;

    // Check if we have tokens available
    if (state.tokens < 1) {
      const waitTimeMs = Math.ceil((1 - state.tokens) / state.refillRate);
      return {
        allowed: false,
        reason: `${serviceName} rate limit exceeded. Wait ${waitTimeMs}ms`,
        currentUsage: usage,
        waitTimeMs,
      };
    }

    // Check daily quota
    if (counters.requestsToday >= this.config.externalAPIDailyQuota) {
      return {
        allowed: false,
        reason: `${serviceName} daily quota exceeded (${counters.requestsToday}/${this.config.externalAPIDailyQuota})`,
        currentUsage: usage,
      };
    }

    return {
      allowed: true,
      currentUsage: usage,
    };
  }

  /**
   * Consume an external API token (call AFTER successful API request).
   */
  trackExternalAPIUsage(serviceName: string, cost = 0): void {
    const state = this.rateLimitStates.get(serviceName);
    if (state) {
      state.tokens = Math.max(0, state.tokens - 1);
    }

    const counters = this.getCounters(serviceName);
    counters.requestsToday++;
    counters.requestsThisMonth++;
    counters.costToday += cost;
    counters.costThisMonth += cost;
    counters.lastRequestTime = new Date();
  }

  // ==========================================================================
  // AGGREGATE STATS & REPORTING
  // ==========================================================================

  /**
   * Get usage stats for all tracked services.
   */
  getAllUsageStats(): APIUsageStats[] {
    const stats: APIUsageStats[] = [];

    for (const [service, counters] of this.usageCounters.entries()) {
      maybeResetCounters(counters);

      const budget =
        service === "openai"
          ? this.config.openaiDailyBudget - counters.costToday
          : this.config.externalAPIDailyQuota - counters.requestsToday;

      stats.push({
        service,
        requestsToday: counters.requestsToday,
        requestsThisMonth: counters.requestsThisMonth,
        costToday: counters.costToday,
        costThisMonth: counters.costThisMonth,
        lastRequestTime: counters.lastRequestTime,
        budgetRemaining: budget,
        quotaRemaining:
          service === "openai"
            ? undefined
            : this.config.externalAPIDailyQuota - counters.requestsToday,
      });
    }

    return stats;
  }

  /**
   * Get human-readable usage report.
   */
  getUsageReport(): string {
    const stats = this.getAllUsageStats();
    const lines = ["=== API Usage Report ===", ""];

    for (const stat of stats) {
      lines.push(`${stat.service.toUpperCase()}:`);
      lines.push(`  Requests today: ${stat.requestsToday}`);
      lines.push(`  Cost today: $${stat.costToday.toFixed(4)}`);
      if (stat.quotaRemaining !== undefined) {
        lines.push(`  Quota remaining: ${stat.quotaRemaining}`);
      }
      lines.push("");
    }

    if (stats.length === 0) {
      lines.push("No API usage recorded yet.");
    }

    return lines.join("\n");
  }

  /**
   * Check if emergency stop should be triggered.
   */
  shouldEmergencyStop(): { stop: boolean; reason?: string } {
    if (!this.config.emergencyStopEnabled) {
      return { stop: false };
    }

    const counters = this.getCounters("openai");

    // Stop if daily budget exceeded
    if (counters.costToday >= this.config.openaiDailyBudget) {
      const reason = `OpenAI daily budget exceeded ($${counters.costToday.toFixed(2)}/$${this.config.openaiDailyBudget})`;
      void this.persistence?.onEmergencyStop?.("openai", reason);
      return { stop: true, reason };
    }

    // Stop if monthly budget exceeded
    if (counters.costThisMonth >= this.config.openaiMonthlyBudget) {
      const reason = `OpenAI monthly budget exceeded ($${counters.costThisMonth.toFixed(2)}/$${this.config.openaiMonthlyBudget})`;
      void this.persistence?.onEmergencyStop?.("openai", reason);
      return { stop: true, reason };
    }

    return { stop: false };
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  /**
   * Estimate OpenAI cost for a transcript.
   * Uses GPT-4o-mini pricing by default.
   */
  estimateOpenAICost(transcript: string, _model = "gpt-4o-mini"): number {
    const tokens = Math.ceil(transcript.length / 4); // ~4 chars per token
    const inputCost = tokens * 0.00000015; // gpt-4o-mini: $0.150 per 1M input tokens
    const outputCost = 150 * 0.0000006; // ~150 output tokens * $0.600 per 1M output tokens
    return inputCost + outputCost;
  }

  /**
   * Reset daily counters.
   */
  resetDailyCounters(): void {
    for (const counters of this.usageCounters.values()) {
      counters.requestsToday = 0;
      counters.costToday = 0;
      counters.dayStart = Date.now();
    }
    this.logger.info("Daily counters reset");
  }

  /**
   * Reset monthly counters.
   */
  resetMonthlyCounters(): void {
    for (const counters of this.usageCounters.values()) {
      counters.requestsThisMonth = 0;
      counters.costThisMonth = 0;
      counters.monthStart = Date.now();
    }
    this.logger.info("Monthly counters reset");
  }

  /**
   * Reset all counters and rate limiters.
   */
  resetAll(): void {
    this.usageCounters.clear();
    this.rateLimitStates.clear();
    this.initializeRateLimiters();
    this.logger.info("All budget counters and rate limiters reset");
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an APIBudgetManager instance with optional config overrides.
 */
export function createBudgetManager(
  config?: Partial<APIBudgetConfig>,
  logger?: Logger,
  persistence?: UsagePersistence
): APIBudgetManager {
  return new APIBudgetManager(config, logger, persistence);
}
