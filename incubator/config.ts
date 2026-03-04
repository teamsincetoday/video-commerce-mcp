/**
 * Incubator Configuration
 *
 * Shared constants, thresholds, and paths for all three autonomous loops.
 * Budgets and thresholds are intentionally conservative — the loops
 * escalate to Jonathan when they hit limits rather than pushing through.
 */

import { writeFileSync, appendFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// PATHS
// ============================================================================

export const PATHS = {
  /** Project root */
  root: resolve(__dirname, ".."),
  /** SQLite databases */
  cacheDb: resolve(__dirname, "../data/cache.db"),
  /** Health snapshots (daily JSON) */
  healthDir: resolve(__dirname, "health"),
  /** Discovery reports (monthly) */
  discoveryDir: resolve(__dirname, "discovery"),
  /** Log files */
  operateLog: resolve(__dirname, "operate-log.md"),
  improveLog: resolve(__dirname, "improve-log.md"),
  alertsFile: resolve(__dirname, "alerts.md"),
  /** Metrics export */
  metricsSnapshot: resolve(__dirname, "../data/metrics-snapshot.json"),
} as const;

// ============================================================================
// BUDGET THRESHOLDS
// ============================================================================

export const BUDGET = {
  /** Alert Jonathan when daily spend exceeds this fraction */
  alertThreshold: 0.8,
  /** Emergency stop — halt all loops */
  emergencyThreshold: 0.95,
  /** Maximum daily OpenAI spend in USD */
  dailyLimit: 0.5,
  /** Maximum monthly OpenAI spend in USD */
  monthlyLimit: 10.0,
} as const;

// ============================================================================
// CACHE THRESHOLDS
// ============================================================================

export const CACHE = {
  /** Warn if hit rate drops below this */
  minHitRate: 0.3,
  /** Auto-cleanup if expired entries exceed this count */
  maxExpiredEntries: 100,
  /** Warn if total size exceeds this (50 MB) */
  maxSizeBytes: 50 * 1024 * 1024,
} as const;

// ============================================================================
// HEALTH CHECK THRESHOLDS
// ============================================================================

export const HEALTH = {
  /** Error rate threshold — above this triggers investigation */
  maxErrorRate: 0.1,
  /** Average processing time threshold in ms */
  maxAvgProcessingTime: 30_000,
  /** Minimum test pass rate */
  minTestPassRate: 1.0,
} as const;

// ============================================================================
// IMPROVE LOOP THRESHOLDS
// ============================================================================

export const IMPROVE = {
  /** Genus-only rate above this triggers NER improvement */
  maxGenusOnlyRate: 0.15,
  /** Correction rate above this triggers prompt review */
  maxCorrectionRate: 0.2,
  /** Minimum average confidence score */
  minAvgConfidence: 0.7,
  /** Maximum "OTHER" category rate before triggering discovery */
  maxOtherCategoryRate: 0.05,
} as const;

// ============================================================================
// DISCOVERY SCORING
// ============================================================================

export const DISCOVERY = {
  /** Minimum convergence score to include in report */
  minConvergenceScore: 0.4,
  /** Verticals to scan for opportunities */
  verticals: ["gardening", "cooking", "diy", "homesteading"] as string[],
  /** Maximum build complexity score to consider (1-10) */
  maxBuildComplexity: 7,
} as const;

// ============================================================================
// COMMERCIAL SUCCESS METRICS
// ============================================================================

/**
 * Success metrics framework. Each MCP product is evaluated on these
 * dimensions weekly. The traction window is 14 days — if metrics don't
 * clear thresholds, pivot to the next opportunity.
 */
export const COMMERCIAL_METRICS = {
  /** 14-day traction window for new MCP concepts */
  tractionWindowDays: 14,

  /** Week 1 thresholds (minimum viable traction) */
  week1: {
    /** Minimum tool calls from external agents */
    minToolCalls: 30,
    /** Minimum unique agent IDs */
    minUniqueAgents: 3,
    /** Minimum npm downloads */
    minDownloads: 50,
  },

  /** Week 2 thresholds (growth signal) */
  week2: {
    /** Growth rate over week 1 (1.0 = flat, 2.0 = doubled) */
    minGrowthRate: 1.5,
    /** Minimum returning agents (used it twice) */
    minReturningAgents: 2,
    /** Any revenue at all is a strong signal */
    revenueIsSignal: true,
  },

  /** Ongoing health (monthly evaluation) */
  monthly: {
    /** Minimum monthly active agents */
    minActiveAgents: 10,
    /** Revenue per month target (USD) */
    revenueTarget: 50,
    /** Minimum calls per month to justify maintenance */
    minCalls: 200,
    /** Error rate must stay below this */
    maxErrorRate: 0.05,
  },

  /** Decision framework */
  decisions: {
    /** Score thresholds for go/no-go after traction window */
    tractionScore: {
      /** 0-3: abandon, move to next concept */
      abandon: 3,
      /** 4-6: iterate for one more week */
      iterate: 6,
      /** 7+: invest, keep building */
      invest: 7,
    },
  },
} as const;

/**
 * Calculate traction score for an MCP product.
 *
 * Returns 0-10 score:
 * - 0-3: No traction, abandon
 * - 4-6: Some signal, iterate once more
 * - 7-10: Clear traction, invest
 */
export function calculateTractionScore(metrics: {
  toolCalls: number;
  uniqueAgents: number;
  returningAgents: number;
  revenue: number;
  growthRate: number;
  errorRate: number;
  communityMentions: number;
}): { score: number; verdict: "abandon" | "iterate" | "invest"; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};

  // Tool calls (0-2 points)
  breakdown["toolCalls"] = Math.min(2, metrics.toolCalls / COMMERCIAL_METRICS.week1.minToolCalls * 2);

  // Unique agents (0-2 points)
  breakdown["uniqueAgents"] = Math.min(2, metrics.uniqueAgents / COMMERCIAL_METRICS.week1.minUniqueAgents * 2);

  // Returning agents (0-2 points) — strongest signal
  breakdown["returningAgents"] = Math.min(2, metrics.returningAgents / COMMERCIAL_METRICS.week2.minReturningAgents * 2);

  // Revenue (0-2 points) — any revenue is a strong signal
  breakdown["revenue"] = metrics.revenue > 0 ? 2 : 0;

  // Growth rate (0-1 point)
  breakdown["growthRate"] = metrics.growthRate >= COMMERCIAL_METRICS.week2.minGrowthRate ? 1 : metrics.growthRate > 1.0 ? 0.5 : 0;

  // Quality penalty (-1 for high error rate)
  breakdown["quality"] = metrics.errorRate > COMMERCIAL_METRICS.monthly.maxErrorRate ? -1 : 0;

  const score = Math.max(0, Math.min(10,
    Object.values(breakdown).reduce((sum, v) => sum + v, 0)
  ));

  const thresholds = COMMERCIAL_METRICS.decisions.tractionScore;
  const verdict = score <= thresholds.abandon
    ? "abandon"
    : score <= thresholds.iterate
      ? "iterate"
      : "invest";

  return { score, verdict, breakdown };
}

// ============================================================================
// LOGGING
// ============================================================================

export type Severity = "info" | "warn" | "error" | "critical";

export interface LogEntry {
  timestamp: string;
  loop: "operate" | "improve" | "discover";
  severity: Severity;
  message: string;
  data?: Record<string, unknown>;
}

export function formatLogEntry(entry: LogEntry): string {
  const icon =
    entry.severity === "critical"
      ? "🔴"
      : entry.severity === "error"
        ? "🟠"
        : entry.severity === "warn"
          ? "🟡"
          : "🟢";
  const data = entry.data ? `\n  ${JSON.stringify(entry.data)}` : "";
  return `- ${icon} **${entry.timestamp}** [${entry.loop}] ${entry.message}${data}`;
}

// ============================================================================
// SLACK NOTIFICATIONS (via nanobot outbox)
// ============================================================================

const INCUBATOR_ALERTS = join(PATHS.incubator, "alerts.md");

/**
 * Log an incubator alert locally. Dara reads this file during heartbeat.
 * All notifications are local — no bridge dependency.
 */
export function notifySlack(message: string, severity: Severity = "info"): boolean {
  try {
    const timestamp = new Date().toISOString();
    const alertLine = `- **[${severity.toUpperCase()}]** ${timestamp} — ${message}\n`;
    appendFileSync(INCUBATOR_ALERTS, alertLine);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// AUTONOMOUS OPERATION BEST PRACTICES
// ============================================================================

/**
 * Safety guardrails for autonomous operation.
 * Each loop checks these before taking action.
 */
export const GUARDRAILS = {
  /** Maximum file writes per loop run (prevents runaway writes) */
  maxFileWritesPerRun: 20,
  /** Maximum npm commands per loop run */
  maxShellCommandsPerRun: 10,
  /** Require test pass before any code commit */
  requireTestsBeforeCommit: true,
  /** Maximum lines of code to auto-modify in one run */
  maxCodeChangeLinesPerRun: 200,
  /** Never modify these paths autonomously */
  protectedPaths: [
    "package.json",
    "tsconfig.json",
    ".env",
    "src/server.ts",
    "src/index.ts",
    "src/cli.ts",
  ] as string[],
  /** Always create backup before modifying source files */
  backupBeforeModify: true,
  /** Maximum retry attempts for failed operations */
  maxRetries: 3,
  /** Cool-down period between retries in ms */
  retryCooldownMs: 5000,
} as const;

// ============================================================================
// UTILITIES
// ============================================================================

export function timestamp(): string {
  return new Date().toISOString();
}

export function today(): string {
  return new Date().toISOString().split("T")[0]!;
}
