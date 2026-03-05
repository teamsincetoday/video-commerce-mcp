/**
 * NIGHTLY REVIEW Loop — Daily Feedback Closure
 *
 * Runs nightly at 23:00 via crontab. Closes the day's open feedback loops:
 * 1. Reads today's health snapshot (Dara's output)
 * 2. Reads usage metering delta (today vs yesterday)
 * 3. Reads session stats (new in v0.2)
 * 4. Checks incidents.md for unresolved entries
 * 5. Reads memory.json for unactioned learnings
 * 6. Computes daily improvement score (0-10)
 * 7. Generates micro-improvement suggestions (threshold tuning, config)
 * 8. Writes nightly-review/YYYY-MM-DD.md digest
 * 9. Appends learnings to memory.json
 *
 * This loop is NOT an agent — it's a system process that closes
 * feedback loops between the three agents (Dara/Kai/Remi).
 *
 * Usage: npx tsx incubator/loops/nightly-review.ts
 */

import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { resolve } from "node:path";
import { createUsageMetering } from "../../src/usage-metering.js";
import {
  PATHS,
  HEALTH,
  CACHE,
  BUDGET,
  timestamp,
  today,
  type Severity,
} from "../config.js";
import { preflight } from "./preflight.js";

// ============================================================================
// TYPES
// ============================================================================

interface DailyDigest {
  date: string;
  timestamp: string;
  improvementScore: number;
  health: HealthSummary | null;
  usage: UsageDelta;
  sessions: SessionSummary;
  incidents: IncidentSummary;
  memoryCheck: MemoryCheck;
  suggestions: Suggestion[];
  learnings: string[];
}

interface HealthSummary {
  status: string;
  cacheHitRate: number;
  errorRate: number;
  testsPassing: boolean;
  budgetUsed: number;
  issues: string[];
}

interface UsageDelta {
  callsToday: number;
  callsYesterday: number;
  delta: number;
  deltaPercent: number;
  uniqueAgentsToday: number;
  revenueToday: number;
  topTools: Array<{ tool: string; calls: number }>;
}

interface SessionSummary {
  totalSessions: number;
  avgDurationSeconds: number;
  avgCallsPerSession: number;
  sessionsWithErrors: number;
}

interface IncidentSummary {
  openCount: number;
  unresolvedTitles: string[];
}

interface MemoryCheck {
  totalEntries: number;
  recentEntries: number;
  unactionedLearnings: string[];
}

interface Suggestion {
  type: "threshold" | "config" | "action" | "investigation";
  priority: number;
  description: string;
  rationale: string;
}

// ============================================================================
// HEALTH SNAPSHOT READER
// ============================================================================

function readTodayHealth(): HealthSummary | null {
  const path = resolve(PATHS.healthDir, `${today()}.json`);
  if (!existsSync(path)) return null;

  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    const cache = raw.cache as Record<string, unknown> | undefined;
    const usage = raw.usage as Record<string, unknown> | undefined;
    const budget = raw.budget as Record<string, unknown> | undefined;
    const tests = raw.tests as Record<string, unknown> | undefined;

    // Collect all issues across dimensions
    const issues: string[] = [];
    for (const section of [cache, usage, budget, tests]) {
      const sectionIssues = section?.issues;
      if (Array.isArray(sectionIssues)) {
        issues.push(...(sectionIssues as string[]));
      }
    }

    return {
      status: (raw.status as string) ?? "unknown",
      cacheHitRate: (cache?.hitRate as number) ?? 0,
      errorRate: 0, // computed from usage metering
      testsPassing:
        (tests?.typecheck as string) === "pass" &&
        (tests?.testSuite as string) === "pass",
      budgetUsed: (budget?.dailyBudgetUsed as number) ?? 0,
      issues,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// USAGE DELTA
// ============================================================================

function computeUsageDelta(): UsageDelta {
  let metering: ReturnType<typeof createUsageMetering> | null = null;
  try {
    metering = createUsageMetering({ dbPath: PATHS.cacheDb });
    const dayStats = metering.getOverviewStats("day");

    // Get yesterday's approximate data from weekly minus today
    const weekStats = metering.getOverviewStats("week");
    const yesterdayApprox = Math.max(
      0,
      Math.round((weekStats.totalCalls - dayStats.totalCalls) / 6),
    );

    const delta = dayStats.totalCalls - yesterdayApprox;
    const deltaPercent =
      yesterdayApprox > 0 ? (delta / yesterdayApprox) * 100 : 0;

    // Top tools by calls
    const topTools = Object.entries(dayStats.callsByTool)
      .map(([tool, calls]) => ({ tool, calls }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 5);

    return {
      callsToday: dayStats.totalCalls,
      callsYesterday: yesterdayApprox,
      delta,
      deltaPercent: Math.round(deltaPercent),
      uniqueAgentsToday: dayStats.uniqueAgents,
      revenueToday: dayStats.totalRevenue,
      topTools,
    };
  } catch {
    return {
      callsToday: 0,
      callsYesterday: 0,
      delta: 0,
      deltaPercent: 0,
      uniqueAgentsToday: 0,
      revenueToday: 0,
      topTools: [],
    };
  } finally {
    metering?.close();
  }
}

// ============================================================================
// SESSION SUMMARY
// ============================================================================

function computeSessionSummary(): SessionSummary {
  let metering: ReturnType<typeof createUsageMetering> | null = null;
  try {
    metering = createUsageMetering({ dbPath: PATHS.cacheDb });
    const stats = metering.getSessionStats("day");
    return {
      totalSessions: stats.totalSessions,
      avgDurationSeconds: stats.avgDurationSeconds,
      avgCallsPerSession: stats.avgCallsPerSession,
      sessionsWithErrors: stats.sessionsWithErrors,
    };
  } catch {
    return {
      totalSessions: 0,
      avgDurationSeconds: 0,
      avgCallsPerSession: 0,
      sessionsWithErrors: 0,
    };
  } finally {
    metering?.close();
  }
}

// ============================================================================
// INCIDENTS CHECK
// ============================================================================

function checkIncidents(): IncidentSummary {
  if (!existsSync(PATHS.incidentsFile)) {
    return { openCount: 0, unresolvedTitles: [] };
  }

  try {
    const content = readFileSync(PATHS.incidentsFile, "utf-8");
    // Find incident headers that don't have a "Resolved:" line after them
    const incidentPattern = /### (INC-[^\n]+)/g;
    const resolvedPattern = /- Resolved: \d{4}-\d{2}-\d{2}/g;

    const incidents = [...content.matchAll(incidentPattern)].map(
      (m) => m[1]!,
    );
    const resolved = [...content.matchAll(resolvedPattern)].length;

    const openCount = Math.max(0, incidents.length - resolved);
    const unresolvedTitles = incidents.slice(resolved);

    return { openCount, unresolvedTitles };
  } catch {
    return { openCount: 0, unresolvedTitles: [] };
  }
}

// ============================================================================
// MEMORY CHECK
// ============================================================================

interface MemoryEntry {
  id: string;
  date: string;
  author: string;
  type: string;
  content: string;
  tags: string[];
  obsolete: boolean;
  actioned?: boolean;
}

function checkMemory(): MemoryCheck {
  if (!existsSync(PATHS.memoryJson)) {
    return { totalEntries: 0, recentEntries: 0, unactionedLearnings: [] };
  }

  try {
    const raw = JSON.parse(readFileSync(PATHS.memoryJson, "utf-8")) as {
      entries: MemoryEntry[];
    };
    const entries = raw.entries.filter((e) => !e.obsolete);
    const todayStr = today();

    // Entries from the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoff = sevenDaysAgo.toISOString().split("T")[0]!;
    const recent = entries.filter((e) => e.date >= cutoff);

    // Unactioned: recent entries of type "learning" or "insight" without actioned flag
    const unactioned = recent
      .filter(
        (e) =>
          (e.type === "learning" || e.type === "insight" || e.type === "traction") &&
          !e.actioned,
      )
      .map((e) => `[${e.id}] ${e.content.slice(0, 100)}`);

    return {
      totalEntries: entries.length,
      recentEntries: recent.length,
      unactionedLearnings: unactioned,
    };
  } catch {
    return { totalEntries: 0, recentEntries: 0, unactionedLearnings: [] };
  }
}

// ============================================================================
// IMPROVEMENT SCORE
// ============================================================================

function computeImprovementScore(
  health: HealthSummary | null,
  usage: UsageDelta,
  sessions: SessionSummary,
  incidents: IncidentSummary,
): number {
  let score = 5; // Baseline: neutral day

  // Health status (+2 healthy, 0 degraded, -2 critical)
  if (health) {
    if (health.status === "healthy") score += 2;
    else if (health.status === "degraded") score -= 1;
    else if (health.status === "critical") score -= 2;

    // Tests passing (+1)
    if (health.testsPassing) score += 1;
    else score -= 2;

    // Budget OK (+0.5 if <50%)
    if (health.budgetUsed < 0.5) score += 0.5;
  }

  // Usage growth (+1 if positive delta)
  if (usage.delta > 0) score += 1;
  if (usage.uniqueAgentsToday > 1) score += 0.5;

  // Sessions quality (+0.5 if avg calls > 2, meaning agents found value)
  if (sessions.avgCallsPerSession > 2) score += 0.5;

  // Open incidents (-1 each, max -2)
  score -= Math.min(2, incidents.openCount);

  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

// ============================================================================
// SUGGESTIONS GENERATOR
// ============================================================================

function generateSuggestions(
  health: HealthSummary | null,
  usage: UsageDelta,
  sessions: SessionSummary,
  incidents: IncidentSummary,
  memory: MemoryCheck,
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Health-based suggestions
  if (health) {
    if (health.cacheHitRate < CACHE.minHitRate && health.cacheHitRate > 0) {
      suggestions.push({
        type: "threshold",
        priority: 60,
        description: `Cache hit rate ${(health.cacheHitRate * 100).toFixed(1)}% below ${CACHE.minHitRate * 100}% threshold`,
        rationale: "Consider lowering threshold or investigating cache miss patterns",
      });
    }

    if (health.budgetUsed > BUDGET.alertThreshold) {
      suggestions.push({
        type: "action",
        priority: 90,
        description: `Budget at ${(health.budgetUsed * 100).toFixed(0)}% — approaching limit`,
        rationale: "Review which tools consume most budget; consider rate limiting expensive tools",
      });
    }

    if (!health.testsPassing) {
      suggestions.push({
        type: "action",
        priority: 100,
        description: "Tests failing — blocks all shipping",
        rationale: "Kai should prioritize test fixes before any new work",
      });
    }
  }

  // Usage-based suggestions
  if (usage.callsToday === 0 && usage.callsYesterday > 0) {
    suggestions.push({
      type: "investigation",
      priority: 80,
      description: "Zero calls today after non-zero yesterday — possible outage",
      rationale: "Dara should check if server is reachable and functioning",
    });
  }

  // Session-based suggestions
  if (sessions.totalSessions > 0 && sessions.avgCallsPerSession < 1.5) {
    suggestions.push({
      type: "investigation",
      priority: 50,
      description: `Low engagement: ${sessions.avgCallsPerSession} calls/session`,
      rationale: "Agents connect but don't find value — review tool discoverability",
    });
  }

  if (sessions.sessionsWithErrors > 0) {
    suggestions.push({
      type: "action",
      priority: 70,
      description: `${sessions.sessionsWithErrors} sessions had errors`,
      rationale: "Investigate error patterns — failing sessions don't return",
    });
  }

  // Incident-based suggestions
  if (incidents.openCount > 0) {
    suggestions.push({
      type: "action",
      priority: 85,
      description: `${incidents.openCount} unresolved incidents: ${incidents.unresolvedTitles.join(", ")}`,
      rationale: "Open incidents compound — Kai should prioritize resolution",
    });
  }

  // Memory-based suggestions
  if (memory.unactionedLearnings.length > 0) {
    suggestions.push({
      type: "action",
      priority: 40,
      description: `${memory.unactionedLearnings.length} unactioned learnings in memory.json`,
      rationale: "Learnings that aren't acted on are wasted — review and action or mark obsolete",
    });
  }

  return suggestions.sort((a, b) => b.priority - a.priority);
}

// ============================================================================
// MARKDOWN FORMATTER
// ============================================================================

function formatDigest(digest: DailyDigest): string {
  const lines: string[] = [];
  lines.push(`# Nightly Review — ${digest.date}`);
  lines.push(`> Generated ${digest.timestamp}`);
  lines.push("");
  lines.push(`**Improvement Score: ${digest.improvementScore}/10**`);
  lines.push("");

  // Health
  lines.push("## Health");
  if (digest.health) {
    lines.push(`- Status: **${digest.health.status}**`);
    lines.push(`- Tests: ${digest.health.testsPassing ? "passing" : "FAILING"}`);
    lines.push(`- Cache hit rate: ${(digest.health.cacheHitRate * 100).toFixed(1)}%`);
    lines.push(`- Budget used: ${(digest.health.budgetUsed * 100).toFixed(0)}%`);
    if (digest.health.issues.length > 0) {
      lines.push(`- Issues: ${digest.health.issues.join("; ")}`);
    }
  } else {
    lines.push("- No health snapshot for today (operate loop may not have run)");
  }
  lines.push("");

  // Usage
  lines.push("## Usage");
  lines.push(`- Calls today: ${digest.usage.callsToday} (${digest.usage.delta >= 0 ? "+" : ""}${digest.usage.delta} vs yesterday avg)`);
  lines.push(`- Unique agents: ${digest.usage.uniqueAgentsToday}`);
  lines.push(`- Revenue: $${digest.usage.revenueToday.toFixed(2)}`);
  if (digest.usage.topTools.length > 0) {
    lines.push(`- Top tools: ${digest.usage.topTools.map((t) => `${t.tool} (${t.calls})`).join(", ")}`);
  }
  lines.push("");

  // Sessions
  lines.push("## Sessions");
  lines.push(`- Total: ${digest.sessions.totalSessions}`);
  lines.push(`- Avg duration: ${digest.sessions.avgDurationSeconds}s`);
  lines.push(`- Avg calls/session: ${digest.sessions.avgCallsPerSession}`);
  if (digest.sessions.sessionsWithErrors > 0) {
    lines.push(`- Sessions with errors: ${digest.sessions.sessionsWithErrors}`);
  }
  lines.push("");

  // Incidents
  lines.push("## Incidents");
  if (digest.incidents.openCount > 0) {
    lines.push(`- **${digest.incidents.openCount} open**: ${digest.incidents.unresolvedTitles.join(", ")}`);
  } else {
    lines.push("- None open");
  }
  lines.push("");

  // Memory
  lines.push("## Institutional Memory");
  lines.push(`- Total entries: ${digest.memoryCheck.totalEntries} (${digest.memoryCheck.recentEntries} recent)`);
  if (digest.memoryCheck.unactionedLearnings.length > 0) {
    lines.push("- Unactioned:");
    for (const l of digest.memoryCheck.unactionedLearnings) {
      lines.push(`  - ${l}`);
    }
  }
  lines.push("");

  // Suggestions
  if (digest.suggestions.length > 0) {
    lines.push("## Suggestions");
    for (const s of digest.suggestions) {
      lines.push(`- **[${s.type}] (P${s.priority})** ${s.description}`);
      lines.push(`  - ${s.rationale}`);
    }
    lines.push("");
  }

  // Learnings
  if (digest.learnings.length > 0) {
    lines.push("## Learnings (appended to memory.json)");
    for (const l of digest.learnings) {
      lines.push(`- ${l}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// MEMORY WRITER
// ============================================================================

function appendToMemory(learnings: string[]): void {
  if (learnings.length === 0) return;
  if (!existsSync(PATHS.memoryJson)) return;

  try {
    const raw = JSON.parse(readFileSync(PATHS.memoryJson, "utf-8")) as {
      entries: MemoryEntry[];
    };

    for (const learning of learnings) {
      const nextId = String(raw.entries.length + 1).padStart(3, "0");
      raw.entries.push({
        id: nextId,
        date: today(),
        author: "nightly-review",
        type: "learning",
        content: learning,
        tags: ["auto-generated", "nightly"],
        obsolete: false,
      });
    }

    writeFileSync(PATHS.memoryJson, JSON.stringify(raw, null, 2));
  } catch {
    // Don't crash on memory write failure
  }
}

// ============================================================================
// MAIN
// ============================================================================

function nightlyReview(): DailyDigest {
  // 1. Read health snapshot
  const health = readTodayHealth();

  // 2. Compute usage delta
  const usage = computeUsageDelta();

  // 3. Session stats
  const sessions = computeSessionSummary();

  // 4. Check incidents
  const incidents = checkIncidents();

  // 5. Check memory
  const memory = checkMemory();

  // 6. Compute improvement score
  const improvementScore = computeImprovementScore(
    health,
    usage,
    sessions,
    incidents,
  );

  // 7. Generate suggestions
  const suggestions = generateSuggestions(
    health,
    usage,
    sessions,
    incidents,
    memory,
  );

  // 8. Derive learnings from today's data
  const learnings: string[] = [];

  if (usage.callsToday > 0 && usage.deltaPercent > 50) {
    learnings.push(
      `Usage spike: ${usage.callsToday} calls (+${usage.deltaPercent}% vs avg). Investigate what drove it.`,
    );
  }

  if (sessions.totalSessions > 0 && sessions.avgCallsPerSession >= 3) {
    learnings.push(
      `High session engagement: ${sessions.avgCallsPerSession} calls/session. Agents finding value.`,
    );
  }

  if (health && !health.testsPassing) {
    learnings.push(
      `Tests failing on ${today()}. Must fix before any shipping.`,
    );
  }

  if (incidents.openCount > 2) {
    learnings.push(
      `${incidents.openCount} open incidents. System stability deteriorating.`,
    );
  }

  const digest: DailyDigest = {
    date: today(),
    timestamp: timestamp(),
    improvementScore,
    health,
    usage,
    sessions,
    incidents,
    memoryCheck: memory,
    suggestions,
    learnings,
  };

  // 9. Write outputs
  mkdirSync(PATHS.nightlyDir, { recursive: true });

  // Markdown digest
  const digestPath = resolve(PATHS.nightlyDir, `${today()}.md`);
  writeFileSync(digestPath, formatDigest(digest));

  // JSON for programmatic consumption
  const jsonPath = resolve(PATHS.nightlyDir, `${today()}.json`);
  writeFileSync(jsonPath, JSON.stringify(digest, null, 2));

  // Append learnings to memory.json
  appendToMemory(learnings);

  return digest;
}

// ============================================================================
// CLI ENTRYPOINT
// ============================================================================

try {
  const gate = preflight();
  if (!gate.ok) {
    console.error(`[nightly-review] Pre-flight FAILED: ${gate.reason}`);
    for (const check of gate.checks.filter((c) => !c.passed)) {
      console.error(`  ✗ ${check.name}: ${check.detail ?? ""}`);
    }
    process.exit(1);
  }

  console.log(`[nightly-review] Starting nightly review — ${today()}`);
  const digest = nightlyReview();

  console.log(`[nightly-review] Improvement Score: ${digest.improvementScore}/10`);
  console.log(`[nightly-review] Health: ${digest.health?.status ?? "no snapshot"}`);
  console.log(`[nightly-review] Usage: ${digest.usage.callsToday} calls, ${digest.usage.uniqueAgentsToday} agents`);
  console.log(`[nightly-review] Sessions: ${digest.sessions.totalSessions} (avg ${digest.sessions.avgCallsPerSession} calls/session)`);
  console.log(`[nightly-review] Incidents: ${digest.incidents.openCount} open`);
  console.log(`[nightly-review] Suggestions: ${digest.suggestions.length}`);
  if (digest.learnings.length > 0) {
    console.log(`[nightly-review] Learnings: ${digest.learnings.length} written to memory.json`);
  }
  console.log(`[nightly-review] Digest written to incubator/nightly-review/${today()}.md`);
} catch (err) {
  console.error("[nightly-review] Fatal error:", err);
  process.exit(1);
}
