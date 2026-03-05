/**
 * Traction Evaluation — 14-day build-measure-learn cycle
 *
 * Reads real usage data from SQLite, computes traction scores using
 * thresholds from config.ts, and writes verdicts to stdout + memory.json.
 *
 * Called by Remi (monthly discovery) or on-demand.
 *
 * Usage: npx tsx incubator/loops/traction-evaluation.ts [--product video-commerce-mcp]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createUsageMetering } from "../../src/usage-metering.js";
import {
  PATHS,
  COMMERCIAL_METRICS,
  calculateTractionScore,
  timestamp,
  today,
} from "../config.js";

// ============================================================================
// TYPES
// ============================================================================

interface TractionReport {
  date: string;
  timestamp: string;
  product: string;
  daysSinceLaunch: number | null;
  metrics: {
    toolCalls: number;
    uniqueAgents: number;
    returningAgents: number;
    revenue: number;
    growthRate: number;
    errorRate: number;
    communityMentions: number;
    topTools: Array<{ tool: string; calls: number }>;
  };
  score: number;
  verdict: "abandon" | "iterate" | "invest";
  breakdown: Record<string, number>;
  recommendation: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function readMemoryJson(): { entries: Array<Record<string, unknown>> } {
  const memPath = resolve(PATHS.root, "incubator/memory.json");
  if (!existsSync(memPath)) return { entries: [] };
  try {
    return JSON.parse(readFileSync(memPath, "utf-8"));
  } catch {
    return { entries: [] };
  }
}

function appendToMemory(entry: Record<string, unknown>): void {
  const memPath = resolve(PATHS.root, "incubator/memory.json");
  const memory = readMemoryJson();
  const nextId = String(memory.entries.length + 1).padStart(3, "0");
  memory.entries.push({ id: nextId, date: today(), ...entry });
  writeFileSync(memPath, JSON.stringify(memory, null, 2));
}

function calculateGrowthRate(weekCalls: number, prevWeekCalls: number): number {
  if (prevWeekCalls === 0) return weekCalls > 0 ? 2.0 : 0;
  return weekCalls / prevWeekCalls;
}

// ============================================================================
// MAIN
// ============================================================================

function evaluate(product: string = "video-commerce-mcp"): TractionReport {
  let metering: ReturnType<typeof createUsageMetering> | null = null;

  try {
    metering = createUsageMetering({ dbPath: PATHS.cacheDb });

    // Get real usage data
    const weekStats = metering.getOverviewStats("week");
    const monthStats = metering.getOverviewStats("month");

    // Calculate returning agents (agents with >1 call)
    // We approximate by comparing unique agents at different windows
    const dayStats = metering.getOverviewStats("day");
    const returningAgents = Math.max(0, monthStats.uniqueAgents - weekStats.uniqueAgents + dayStats.uniqueAgents);

    // Calculate error rate from per-tool stats
    let totalCalls = 0;
    let totalErrors = 0;
    for (const tool of Object.keys(weekStats.callsByTool)) {
      const toolStats = metering.getToolStats(tool, "week");
      totalCalls += toolStats.totalCalls;
      totalErrors += toolStats.failedCalls;
    }
    const errorRate = totalCalls > 0 ? totalErrors / totalCalls : 0;
    // Guard against NaN when no tool stats exist
    const safeErrorRate = Number.isNaN(errorRate) ? 0 : errorRate;

    // Growth rate: this week vs implied previous week
    const thisWeekCalls = weekStats.totalCalls;
    const monthCalls = monthStats.totalCalls;
    const prevWeekCalls = Math.max(0, monthCalls - thisWeekCalls);
    const growthRate = calculateGrowthRate(thisWeekCalls, prevWeekCalls);

    // Top tools by usage
    const topTools = Object.entries(weekStats.callsByTool)
      .map(([tool, calls]) => ({ tool, calls }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 5);

    const metrics = {
      toolCalls: weekStats.totalCalls,
      uniqueAgents: weekStats.uniqueAgents,
      returningAgents,
      revenue: monthStats.totalRevenue,
      growthRate,
      errorRate: safeErrorRate,
      communityMentions: 0, // Not yet tracked — future enhancement
      topTools,
    };

    // Compute traction score using config.ts function
    const { score, verdict, breakdown } = calculateTractionScore(metrics);

    // Generate recommendation
    let recommendation: string;
    if (verdict === "abandon") {
      recommendation = `Score ${score.toFixed(1)}/10. PIVOT: ${product} has not found traction in the measurement window. Execute pivot playbook: post-mortem → archive → scan for next opportunity.`;
    } else if (verdict === "iterate") {
      recommendation = `Score ${score.toFixed(1)}/10. ITERATE: ${product} shows some signal but not enough to invest. Focus on: ${metrics.uniqueAgents < COMMERCIAL_METRICS.week1.minUniqueAgents ? "agent acquisition, " : ""}${metrics.revenue === 0 ? "revenue activation, " : ""}${errorRate > 0.05 ? "error rate reduction" : "growth acceleration"}.`;
    } else {
      recommendation = `Score ${score.toFixed(1)}/10. INVEST: ${product} has clear traction. Double down on what's working. Top tools: ${topTools.map(t => t.tool).join(", ")}.`;
    }

    return {
      date: today(),
      timestamp: timestamp(),
      product,
      daysSinceLaunch: null, // Would need launch date tracking
      metrics,
      score,
      verdict,
      breakdown,
      recommendation,
    };
  } finally {
    metering?.close();
  }
}

// ============================================================================
// CLI ENTRYPOINT
// ============================================================================

try {
  const productArg = process.argv.find(a => a.startsWith("--product="));
  const product = productArg?.split("=")[1] ?? "video-commerce-mcp";

  console.log(`[traction] Evaluating ${product} — ${today()}`);
  const report = evaluate(product);

  console.log(`[traction] Metrics: ${report.metrics.toolCalls} calls/week, ${report.metrics.uniqueAgents} agents, $${report.metrics.revenue.toFixed(2)} revenue`);
  console.log(`[traction] Growth rate: ${report.metrics.growthRate.toFixed(2)}x, Error rate: ${(report.metrics.errorRate * 100).toFixed(1)}%`);
  console.log(`[traction] Score: ${report.score.toFixed(1)}/10 → ${report.verdict.toUpperCase()}`);
  console.log(`[traction] Breakdown: ${JSON.stringify(report.breakdown)}`);
  console.log(`[traction] ${report.recommendation}`);

  // Write to memory.json
  appendToMemory({
    author: "traction-evaluation",
    type: "traction",
    content: `${product}: score ${report.score.toFixed(1)}/10, verdict ${report.verdict}. ${report.metrics.toolCalls} calls/week, ${report.metrics.uniqueAgents} agents, $${report.metrics.revenue.toFixed(2)} revenue.`,
    tags: ["traction", product],
    obsolete: false,
  });

  console.log(`[traction] Written to incubator/memory.json`);
} catch (err) {
  console.error("[traction] Fatal error:", err);
  process.exit(1);
}
