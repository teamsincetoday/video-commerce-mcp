/**
 * OPERATE Loop — Daily Health Check
 *
 * Runs daily at 06:00 via cron. Single invocation that:
 * 1. Checks cache health (hit rate, size, expired entries)
 * 2. Checks usage metering (error rates, processing times)
 * 3. Checks API budget state (daily/monthly spend vs limits)
 * 4. Runs typecheck and tests
 * 5. Auto-fixes safe issues (cache cleanup, stale data)
 * 6. Writes health snapshot + log entries
 * 7. Alerts on budget warnings
 *
 * Usage: npx tsx incubator/loops/operate.ts
 */

import { writeFileSync, appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { createAnalysisCache } from "../../src/analysis-cache.js";
import { createUsageMetering } from "../../src/usage-metering.js";
import { createBudgetManager } from "../../src/ai/api-budget-manager.js";
import {
  PATHS,
  BUDGET,
  CACHE,
  HEALTH,
  timestamp,
  today,
  formatLogEntry,
  notifySlack,
  type LogEntry,
  type Severity,
} from "../config.js";

// ============================================================================
// TYPES
// ============================================================================

interface HealthSnapshot {
  date: string;
  timestamp: string;
  status: "healthy" | "degraded" | "critical";
  cache: {
    totalEntries: number;
    totalSizeBytes: number;
    hitRate: number;
    hits: number;
    misses: number;
    expiredEntries: number;
    cleanedUp: number;
    issues: string[];
  };
  usage: {
    totalCallsToday: number;
    totalCallsWeek: number;
    totalCallsMonth: number;
    avgProcessingTime: number;
    revenueToday: number;
    revenueMonth: number;
    uniqueAgentsToday: number;
    toolBreakdown: Record<string, number>;
    issues: string[];
  };
  budget: {
    dailySpend: number;
    monthlySpend: number;
    dailyBudgetUsed: number;
    monthlyBudgetUsed: number;
    emergencyStop: boolean;
    issues: string[];
  };
  tests: {
    typecheck: "pass" | "fail" | "skipped";
    testSuite: "pass" | "fail" | "skipped";
    typecheckOutput?: string;
    testOutput?: string;
    issues: string[];
  };
  actions: string[];
  alerts: string[];
}

// ============================================================================
// MAIN
// ============================================================================

function operate(): HealthSnapshot {
  const logs: LogEntry[] = [];
  const actions: string[] = [];
  const alerts: string[] = [];
  let overallStatus: "healthy" | "degraded" | "critical" = "healthy";

  function log(severity: Severity, message: string, data?: Record<string, unknown>) {
    logs.push({ timestamp: timestamp(), loop: "operate", severity, message, data });
    if (severity === "error" || severity === "critical") overallStatus = severity === "critical" ? "critical" : "degraded";
  }

  // ── 1. Cache Health ─────────────────────────────────────────────────
  let cacheResult: HealthSnapshot["cache"];
  {
    let cache: ReturnType<typeof createAnalysisCache> | null = null;
    try {
      cache = createAnalysisCache({ dbPath: PATHS.cacheDb });
      const stats = cache.getStats();
      let cleanedUp = 0;
      const issues: string[] = [];

      // Auto-cleanup expired entries
      if (stats.expiredEntries > CACHE.maxExpiredEntries) {
        cleanedUp = cache.cleanup();
        actions.push(`Cleaned up ${cleanedUp} expired cache entries`);
        log("info", `Cache cleanup: removed ${cleanedUp} expired entries`);
      }

      // Check hit rate
      if (stats.hitRate < CACHE.minHitRate && stats.hits + stats.misses > 10) {
        issues.push(`Low cache hit rate: ${(stats.hitRate * 100).toFixed(1)}% (threshold: ${CACHE.minHitRate * 100}%)`);
        log("warn", `Cache hit rate below threshold`, { hitRate: stats.hitRate, threshold: CACHE.minHitRate });
      }

      // Check size
      if (stats.totalSizeBytes > CACHE.maxSizeBytes) {
        issues.push(`Cache size exceeds limit: ${(stats.totalSizeBytes / 1024 / 1024).toFixed(1)}MB`);
        log("warn", `Cache size exceeds ${CACHE.maxSizeBytes / 1024 / 1024}MB limit`);
      }

      cacheResult = {
        totalEntries: stats.totalEntries,
        totalSizeBytes: stats.totalSizeBytes,
        hitRate: stats.hitRate,
        hits: stats.hits,
        misses: stats.misses,
        expiredEntries: stats.expiredEntries,
        cleanedUp,
        issues,
      };
    } catch (err) {
      log("error", `Cache health check failed: ${err}`);
      cacheResult = {
        totalEntries: 0, totalSizeBytes: 0, hitRate: 0, hits: 0,
        misses: 0, expiredEntries: 0, cleanedUp: 0,
        issues: [`Cache check failed: ${err}`],
      };
    } finally {
      cache?.close();
    }
  }

  // ── 2. Usage Metering ───────────────────────────────────────────────
  let usageResult: HealthSnapshot["usage"];
  {
    let metering: ReturnType<typeof createUsageMetering> | null = null;
    try {
      metering = createUsageMetering({ dbPath: PATHS.cacheDb });
      const dayStats = metering.getOverviewStats("day");
      const weekStats = metering.getOverviewStats("week");
      const monthStats = metering.getOverviewStats("month");
      const issues: string[] = [];

      // Check processing time
      if (dayStats.avgProcessingTime > HEALTH.maxAvgProcessingTime) {
        issues.push(`High avg processing time: ${dayStats.avgProcessingTime}ms`);
        log("warn", `Processing time above threshold`, {
          avg: dayStats.avgProcessingTime,
          threshold: HEALTH.maxAvgProcessingTime,
        });
      }

      // Check per-tool error rates
      const toolNames = Object.keys(dayStats.callsByTool);
      for (const tool of toolNames) {
        const toolStats = metering.getToolStats(tool, "day");
        if (toolStats.errorRate > HEALTH.maxErrorRate && toolStats.totalCalls > 5) {
          issues.push(`High error rate for ${tool}: ${(toolStats.errorRate * 100).toFixed(1)}%`);
          log("warn", `Tool error rate above threshold`, { tool, errorRate: toolStats.errorRate });
        }
      }

      usageResult = {
        totalCallsToday: dayStats.totalCalls,
        totalCallsWeek: weekStats.totalCalls,
        totalCallsMonth: monthStats.totalCalls,
        avgProcessingTime: dayStats.avgProcessingTime,
        revenueToday: dayStats.totalRevenue,
        revenueMonth: monthStats.totalRevenue,
        uniqueAgentsToday: dayStats.uniqueAgents,
        toolBreakdown: dayStats.callsByTool,
        issues,
      };
    } catch (err) {
      log("error", `Usage metering check failed: ${err}`);
      usageResult = {
        totalCallsToday: 0, totalCallsWeek: 0, totalCallsMonth: 0,
        avgProcessingTime: 0, revenueToday: 0, revenueMonth: 0,
        uniqueAgentsToday: 0, toolBreakdown: {},
        issues: [`Usage check failed: ${err}`],
      };
    } finally {
      metering?.close();
    }
  }

  // ── 3. Budget State ─────────────────────────────────────────────────
  let budgetResult: HealthSnapshot["budget"];
  try {
    const budget = createBudgetManager();
    const allStats = budget.getAllUsageStats();
    const emergency = budget.shouldEmergencyStop();
    const issues: string[] = [];

    // Sum up costs across services
    let dailySpend = 0;
    let monthlySpend = 0;
    for (const svc of allStats) {
      dailySpend += svc.costToday;
      monthlySpend += svc.costThisMonth;
    }

    const dailyUsed = dailySpend / BUDGET.dailyLimit;
    const monthlyUsed = monthlySpend / BUDGET.monthlyLimit;

    if (emergency.stop) {
      issues.push(`EMERGENCY STOP: ${emergency.reason}`);
      alerts.push(`EMERGENCY: Budget emergency stop triggered — ${emergency.reason}`);
      log("critical", `Budget emergency stop`, { reason: emergency.reason });
      overallStatus = "critical";
    } else if (dailyUsed > BUDGET.alertThreshold || monthlyUsed > BUDGET.alertThreshold) {
      issues.push(`Budget warning: daily ${(dailyUsed * 100).toFixed(0)}%, monthly ${(monthlyUsed * 100).toFixed(0)}%`);
      alerts.push(`Budget approaching limit: daily $${dailySpend.toFixed(2)}/${BUDGET.dailyLimit}, monthly $${monthlySpend.toFixed(2)}/${BUDGET.monthlyLimit}`);
      log("warn", `Budget above alert threshold`, { dailyUsed, monthlyUsed });
    }

    budgetResult = {
      dailySpend,
      monthlySpend,
      dailyBudgetUsed: dailyUsed,
      monthlyBudgetUsed: monthlyUsed,
      emergencyStop: emergency.stop,
      issues,
    };
  } catch (err) {
    log("error", `Budget check failed: ${err}`);
    budgetResult = {
      dailySpend: 0, monthlySpend: 0, dailyBudgetUsed: 0,
      monthlyBudgetUsed: 0, emergencyStop: false,
      issues: [`Budget check failed: ${err}`],
    };
  }

  // ── 4. TypeCheck + Tests ────────────────────────────────────────────
  let testsResult: HealthSnapshot["tests"];
  try {
    const issues: string[] = [];
    let typecheckStatus: "pass" | "fail" = "pass";
    let typecheckOutput = "";
    let testStatus: "pass" | "fail" = "pass";
    let testOutput = "";

    // TypeCheck
    try {
      typecheckOutput = execSync("npm run typecheck 2>&1", {
        cwd: PATHS.root,
        timeout: 60_000,
        encoding: "utf-8",
      });
    } catch (err) {
      typecheckStatus = "fail";
      typecheckOutput = (err as { stdout?: string }).stdout ?? String(err);
      issues.push("TypeCheck failed");
      log("error", "TypeCheck failed", { output: typecheckOutput.slice(0, 500) });
    }

    // Tests
    try {
      testOutput = execSync("npm test 2>&1", {
        cwd: PATHS.root,
        timeout: 120_000,
        encoding: "utf-8",
      });
    } catch (err) {
      testStatus = "fail";
      testOutput = (err as { stdout?: string }).stdout ?? String(err);
      issues.push("Test suite failed");
      log("error", "Test suite failed", { output: testOutput.slice(0, 500) });
    }

    testsResult = {
      typecheck: typecheckStatus,
      testSuite: testStatus,
      typecheckOutput: typecheckOutput.slice(0, 2000),
      testOutput: testOutput.slice(0, 2000),
      issues,
    };
  } catch (err) {
    log("error", `Test execution failed: ${err}`);
    testsResult = {
      typecheck: "skipped",
      testSuite: "skipped",
      issues: [`Test execution failed: ${err}`],
    };
  }

  // ── 5. Assemble Snapshot ────────────────────────────────────────────
  const snapshot: HealthSnapshot = {
    date: today(),
    timestamp: timestamp(),
    status: overallStatus,
    cache: cacheResult,
    usage: usageResult,
    budget: budgetResult,
    tests: testsResult,
    actions,
    alerts,
  };

  // ── 6. Write Outputs ───────────────────────────────────────────────
  // Health snapshot
  mkdirSync(PATHS.healthDir, { recursive: true });
  const snapshotPath = resolve(PATHS.healthDir, `${today()}.json`);
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

  // Append to operate log
  const logLines = logs.map(formatLogEntry).join("\n");
  const logSection = `\n## ${today()}\n\n${logLines || "- 🟢 All checks passed"}\n`;
  if (existsSync(PATHS.operateLog)) {
    appendFileSync(PATHS.operateLog, logSection);
  } else {
    writeFileSync(PATHS.operateLog, `# Operate Log\n${logSection}`);
  }

  // Append alerts
  if (alerts.length > 0) {
    const alertSection = `\n## ${today()}\n\n${alerts.map((a) => `- ⚠️ ${a}`).join("\n")}\n`;
    if (existsSync(PATHS.alertsFile)) {
      appendFileSync(PATHS.alertsFile, alertSection);
    } else {
      writeFileSync(PATHS.alertsFile, `# Alerts\n${alertSection}`);
    }

    // Notify Jonathan via Slack gateway
    const slackSeverity = overallStatus === "critical" ? "critical" : "warn";
    notifySlack(
      `[MCP Incubator] ${overallStatus.toUpperCase()}: ${alerts.join("; ")}`,
      slackSeverity
    );
  }

  return snapshot;
}

// ============================================================================
// CLI ENTRYPOINT
// ============================================================================

try {
  console.log(`[operate] Starting daily health check — ${today()}`);
  const snapshot = operate();

  console.log(`[operate] Status: ${snapshot.status}`);
  console.log(`[operate] Cache: ${snapshot.cache.totalEntries} entries, hit rate ${(snapshot.cache.hitRate * 100).toFixed(1)}%`);
  console.log(`[operate] Usage: ${snapshot.usage.totalCallsToday} calls today, $${snapshot.usage.revenueMonth.toFixed(2)} revenue this month`);
  console.log(`[operate] Budget: ${(snapshot.budget.dailyBudgetUsed * 100).toFixed(0)}% daily, ${(snapshot.budget.monthlyBudgetUsed * 100).toFixed(0)}% monthly`);
  console.log(`[operate] Tests: typecheck=${snapshot.tests.typecheck}, tests=${snapshot.tests.testSuite}`);
  if (snapshot.actions.length > 0) console.log(`[operate] Actions: ${snapshot.actions.join(", ")}`);
  if (snapshot.alerts.length > 0) console.log(`[operate] ALERTS: ${snapshot.alerts.join("; ")}`);
  console.log(`[operate] Health snapshot written to incubator/health/${today()}.json`);
} catch (err) {
  console.error("[operate] Fatal error:", err);
  process.exit(1);
}
