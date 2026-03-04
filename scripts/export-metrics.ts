/**
 * Metrics Export Script
 *
 * Reads SQLite databases and in-memory state, writes a JSON snapshot.
 * Foundation for all incubator loops — they read this snapshot rather
 * than each instantiating their own DB connections.
 *
 * Usage: npx tsx scripts/export-metrics.ts
 * Output: data/metrics-snapshot.json
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createAnalysisCache } from "../src/analysis-cache.js";
import { createUsageMetering } from "../src/usage-metering.js";
import { createBudgetManager } from "../src/ai/api-budget-manager.js";
import { PATHS, timestamp } from "../incubator/config.js";

// ============================================================================
// TYPES
// ============================================================================

export interface MetricsSnapshot {
  exportedAt: string;
  cache: {
    totalEntries: number;
    totalSizeBytes: number;
    hitRate: number;
    hits: number;
    misses: number;
    expiredEntries: number;
    oldestEntry: string | null;
    newestEntry: string | null;
  };
  usage: {
    day: {
      totalCalls: number;
      totalRevenue: number;
      uniqueAgents: number;
      callsByTool: Record<string, number>;
      avgProcessingTime: number;
    };
    week: {
      totalCalls: number;
      totalRevenue: number;
      uniqueAgents: number;
      callsByTool: Record<string, number>;
      avgProcessingTime: number;
    };
    month: {
      totalCalls: number;
      totalRevenue: number;
      uniqueAgents: number;
      callsByTool: Record<string, number>;
      avgProcessingTime: number;
    };
  };
  budget: {
    services: Array<{
      service: string;
      requestsToday: number;
      requestsThisMonth: number;
      costToday: number;
      costThisMonth: number;
      budgetRemaining: number;
    }>;
    emergencyStop: { stop: boolean; reason?: string };
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export function exportMetrics(): MetricsSnapshot {
  const cache = createAnalysisCache({ dbPath: PATHS.cacheDb });
  const metering = createUsageMetering({ dbPath: PATHS.cacheDb });

  try {
    const cacheStats = cache.getStats();
    const usageDay = metering.getOverviewStats("day");
    const usageWeek = metering.getOverviewStats("week");
    const usageMonth = metering.getOverviewStats("month");

    const budget = createBudgetManager();
    const budgetStats = budget.getAllUsageStats();
    const emergencyStop = budget.shouldEmergencyStop();

  return {
    exportedAt: timestamp(),
    cache: {
      totalEntries: cacheStats.totalEntries,
      totalSizeBytes: cacheStats.totalSizeBytes,
      hitRate: cacheStats.hitRate,
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      expiredEntries: cacheStats.expiredEntries,
      oldestEntry: cacheStats.oldestEntry?.toISOString() ?? null,
      newestEntry: cacheStats.newestEntry?.toISOString() ?? null,
    },
    usage: {
      day: {
        totalCalls: usageDay.totalCalls,
        totalRevenue: usageDay.totalRevenue,
        uniqueAgents: usageDay.uniqueAgents,
        callsByTool: usageDay.callsByTool,
        avgProcessingTime: usageDay.avgProcessingTime,
      },
      week: {
        totalCalls: usageWeek.totalCalls,
        totalRevenue: usageWeek.totalRevenue,
        uniqueAgents: usageWeek.uniqueAgents,
        callsByTool: usageWeek.callsByTool,
        avgProcessingTime: usageWeek.avgProcessingTime,
      },
      month: {
        totalCalls: usageMonth.totalCalls,
        totalRevenue: usageMonth.totalRevenue,
        uniqueAgents: usageMonth.uniqueAgents,
        callsByTool: usageMonth.callsByTool,
        avgProcessingTime: usageMonth.avgProcessingTime,
      },
    },
    budget: {
      services: budgetStats.map((s) => ({
        service: s.service,
        requestsToday: s.requestsToday,
        requestsThisMonth: s.requestsThisMonth,
        costToday: s.costToday,
        costThisMonth: s.costThisMonth,
        budgetRemaining: s.budgetRemaining,
      })),
      emergencyStop,
    },
  };
  } finally {
    cache.close();
    metering.close();
  }
}

// ============================================================================
// CLI ENTRYPOINT
// ============================================================================

if (
  process.argv[1] &&
  (process.argv[1].endsWith("export-metrics.ts") ||
    process.argv[1].endsWith("export-metrics.js"))
) {
  try {
    const snapshot = exportMetrics();
    mkdirSync(dirname(PATHS.metricsSnapshot), { recursive: true });
    writeFileSync(PATHS.metricsSnapshot, JSON.stringify(snapshot, null, 2));
    console.log(`Metrics exported to ${PATHS.metricsSnapshot}`);
    console.log(
      `  Cache: ${snapshot.cache.totalEntries} entries, ${(snapshot.cache.totalSizeBytes / 1024).toFixed(1)} KB`
    );
    console.log(
      `  Usage (month): ${snapshot.usage.month.totalCalls} calls, $${snapshot.usage.month.totalRevenue.toFixed(2)} revenue`
    );
    console.log(
      `  Budget: ${snapshot.budget.services.length} services tracked`
    );
  } catch (err) {
    console.error("Failed to export metrics:", err);
    process.exit(1);
  }
}
